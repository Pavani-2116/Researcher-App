"""Small standard-library HTTP API and static-file server for Source & Story."""

from __future__ import annotations

import json
import mimetypes
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

FRONTEND = Path(__file__).resolve().parents[1] / "frontend" / "dist"


def load_local_env(path: Path | None = None) -> None:
    env_file = path or Path(__file__).resolve().parents[1] / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        entry = line.strip()
        if not entry or entry.startswith("#") or "=" not in entry:
            continue
        key, value = entry.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value[:1] == value[-1:] and value.startswith(("'", '"')) and len(value) >= 2:
            value = value[1:-1]
        if key and key.replace("_", "").isalnum():
            os.environ.setdefault(key, value)


load_local_env()

from backend.services import editorial as service


class Handler(BaseHTTPRequestHandler):
    server_version = "SourceAndStory/1.0"

    def _json(self, status: int, payload: dict | list) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(encoded)

    def _cors_headers(self) -> None:
        allowed = {origin.strip() for origin in os.environ.get("SIGNALDESK_CORS_ORIGINS", "").split(",") if origin.strip()}
        origin = self.headers.get("Origin")
        if origin and origin in allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def do_OPTIONS(self) -> None:
        allowed = {origin.strip() for origin in os.environ.get("SIGNALDESK_CORS_ORIGINS", "").split(",") if origin.strip()}
        origin = self.headers.get("Origin")
        self.send_response(204)
        if origin and origin in allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Vary", "Origin")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise service.ServiceError(400, "Invalid request length.") from exc
        if length < 0 or length > service.MAX_BODY:
            raise service.ServiceError(413, "Request body exceeds the 1 MB limit.")
        try:
            value = json.loads(self.rfile.read(length) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise service.ServiceError(400, "Request body must be valid JSON.") from exc
        if not isinstance(value, dict):
            raise service.ServiceError(400, "Request body must be a JSON object.")
        return value

    def _dispatch(self, operation) -> None:
        try:
            self._json(200, operation())
        except service.ServiceError as exc:
            self._json(exc.status, {"error": exc.message})
        except Exception:
            self._json(500, {"error": "The request could not be completed. Check the server log."})
            self.log_error("Unhandled request error")

    def do_GET(self) -> None:
        path = unquote(urlsplit(self.path).path)
        if path == "/api/health":
            return self._dispatch(service.health)
        if path == "/api/projects":
            return self._dispatch(service.list_projects)
        export_match = re.fullmatch(r"/api/projects/([a-fA-F0-9-]+)/export\.md", path)
        if export_match:
            try:
                content = service.export_project_markdown(export_match.group(1)).encode("utf-8")
            except service.ServiceError as exc:
                return self._json(exc.status, {"error": exc.message})
            self.send_response(200)
            self.send_header("Content-Type", "text/markdown; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Content-Disposition", 'attachment; filename="source-and-story-newsletter.md"')
            self.send_header("X-Content-Type-Options", "nosniff")
            self._cors_headers()
            self.end_headers()
            self.wfile.write(content)
            return
        match = re.fullmatch(r"/api/projects/([a-fA-F0-9-]+)", path)
        if match:
            return self._dispatch(lambda: service.get_project(match.group(1)))
        self._serve_static(path)

    def do_POST(self) -> None:
        try:
            body = self._body()
            path = urlsplit(self.path).path
            if path == "/api/sources/extract":
                return self._dispatch(lambda: service.extract_article(str(body.get("url") or "")))
            if path == "/api/research/process":
                return self._dispatch(lambda: {"sources": service.process_sources(body.get("sources"))})
            if path == "/api/research/analyze":
                return self._dispatch(lambda: service.analyze_research(body.get("sources"), str(body.get("angle") or "")))
            if path == "/api/writing/analyze":
                return self._dispatch(lambda: service.analyze_writing(body.get("text", "")))
            if path == "/api/writing/metrics":
                return self._dispatch(lambda: service.get_writing_metrics(body.get("text", "")))
            if path == "/api/newsletter/generate":
                return self._dispatch(lambda: service.generate_newsletter(body.get("brief"), str(body.get("angle_id") or "")))
            if path == "/api/projects":
                return self._dispatch(lambda: service.create_project(body))
            self._json(404, {"error": "API endpoint not found."})
        except service.ServiceError as exc:
            self._json(exc.status, {"error": exc.message})

    def do_DELETE(self) -> None:
        path = unquote(urlsplit(self.path).path)
        match = re.fullmatch(r"/api/projects/([a-fA-F0-9-]+)", path)
        if not match:
            return self._json(404, {"error": "Project not found."})
        def delete():
            service.delete_project(match.group(1))
            return {"deleted": True}
        return self._dispatch(delete)

    def _serve_static(self, path: str) -> None:
        relative = "index.html" if path in ("/", "") else path.lstrip("/")
        candidate = (FRONTEND / relative).resolve()
        if FRONTEND.resolve() not in candidate.parents and candidate != FRONTEND.resolve():
            return self._json(404, {"error": "File not found."})
        if not candidate.is_file():
            return self._json(404, {"error": "File not found."})
        content = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(candidate.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format: str, *args) -> None:
        super().log_message(format, *args)


def main() -> None:
    from os import environ
    load_local_env()
    host = environ.get("SIGNALDESK_HOST", "127.0.0.1")
    port = int(environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Source & Story running at http://{host}:{port} (mode: {service.health()['mode']})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Source & Story.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
