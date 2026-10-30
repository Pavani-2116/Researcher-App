"""Application logic for Source & Story; uses only the Python standard library."""

from __future__ import annotations

import hashlib
import html
import ipaddress
import json
import os
import re
import socket
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

ROOT = Path(__file__).resolve().parents[2]
DATABASE = Path(os.environ.get("SIGNALDESK_DB") or (ROOT / "backend" / "signaldesk.sqlite3"))
MAX_BODY = 1_000_000
MAX_SOURCE_TEXT = 100_000
MAX_SOURCES = 10
MIN_SOURCES = 3
MIN_SOURCE_TEXT = 10
FILLER_PHRASES = (
    "in order to", "it is important to note that", "it should be noted that",
    "at this point in time", "due to the fact that", "in terms of", "basically",
    "actually", "very", "really",
)
JARGON = {
    "inference-time": "Explain what happens while a model is generating an answer.",
    "RAG": "Spell out retrieval-augmented generation and explain how outside information is retrieved.",
    "agentic": "Describe what actions the system can take, rather than relying on this broad label.",
    "token": "Explain that a token is a piece of text processed by a model.",
    "fine-tuning": "Briefly describe how additional examples adapt a model.",
    "benchmark": "Explain what the test measures and what it does not.",
}
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
WORD_RE = re.compile(r"\b[\w'-]+\b", re.UNICODE)


class ServiceError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def db_connect() -> sqlite3.Connection:
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """CREATE TABLE IF NOT EXISTS projects (
             id TEXT PRIMARY KEY, title TEXT NOT NULL, data TEXT NOT NULL,
             created_at TEXT NOT NULL, updated_at TEXT NOT NULL
           )"""
    )
    return connection


@contextmanager
def db_session():
    connection = db_connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def create_project(payload: dict[str, Any]) -> dict[str, Any]:
    project_id = str(payload.get("id") or uuid.uuid4())
    title = str(payload.get("title") or "Untitled editorial project")[:160]
    data = payload.get("data", {})
    if not isinstance(data, dict):
        raise ServiceError(400, "Project data must be an object.")
    timestamp = now()
    with db_session() as db:
        db.execute(
            "INSERT OR REPLACE INTO projects (id,title,data,created_at,updated_at) VALUES (?,?,?,?,?)",
            (project_id, title, json.dumps(data), timestamp, timestamp),
        )
    return {"id": project_id, "title": title, "data": data, "created_at": timestamp, "updated_at": timestamp}


def list_projects() -> list[dict[str, Any]]:
    with db_session() as db:
        rows = db.execute("SELECT id,title,created_at,updated_at FROM projects ORDER BY updated_at DESC").fetchall()
    return [dict(row) for row in rows]


def get_project(project_id: str) -> dict[str, Any]:
    with db_session() as db:
        row = db.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    if row is None:
        raise ServiceError(404, "Saved project not found.")
    result = dict(row)
    result["data"] = json.loads(result["data"])
    return result


def delete_project(project_id: str) -> None:
    with db_session() as db:
        cursor = db.execute("DELETE FROM projects WHERE id=?", (project_id,))
    if cursor.rowcount == 0:
        raise ServiceError(404, "Saved project not found.")


def export_project_markdown(project_id: str) -> str:
    project = get_project(project_id)
    data = project["data"]
    draft = str(data.get("draft") or "").strip()
    if not draft:
        raise ServiceError(400, "This project has no newsletter draft to export.")
    if not str(data.get("articleHeadline") or "").strip():
        raise ServiceError(400, "Generate a newsletter draft from the current research brief before exporting.")
    brief = data.get("brief") if isinstance(data.get("brief"), dict) else {}
    records = brief.get("source_records", []) if isinstance(brief.get("source_records"), list) else []
    if not records:
        raise ServiceError(400, "A newsletter export requires its research brief and source records.")
    headline = str(data.get("articleHeadline")).replace("\r", " ").replace("\n", " ").strip()
    references = []
    for source in records:
        if not isinstance(source, dict):
            continue
        source_id = str(source.get("id") or "")
        title = str(source.get("title") or "Untitled source").replace("\r", " ").replace("\n", " ").replace("]", "\\]")
        url = str(source.get("url") or "")
        if url:
            validate_public_url(url)
        references.append(f"- [{source_id}] {title}" + (f" — {url}" if url else ""))
    reference_text = "\n".join(references) or "- No source records were saved."
    return (
        f"# {headline}\n\n{draft}\n\n## Sources\n\n{reference_text}\n\n"
        "> Review note: verify all source material and citations before publication."
    )


def validate_public_url(url: str) -> str:
    try:
        parsed = urlsplit(url.strip())
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Use a public http:// or https:// URL without embedded credentials.")
        hostname = parsed.hostname.rstrip(".").lower()
        if hostname == "localhost" or hostname.endswith(".localhost") or hostname.endswith(".local"):
            raise ValueError("Local and private network URLs are not allowed.")
        try:
            addresses = [ipaddress.ip_address(hostname)]
        except ValueError:
            addresses = [ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(hostname, None)]
        if not addresses or any(not address.is_global for address in addresses):
            raise ValueError("The URL resolves to a non-public network address.")
        return url
    except (ValueError, OSError, socket.gaierror) as exc:
        raise ServiceError(400, f"Unsafe or invalid URL: {exc}") from exc


class SafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_public_url(urljoin(req.full_url, newurl))
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class ArticleParser(HTMLParser):
    BLOCKS = {"p", "h1", "h2", "h3", "li", "blockquote", "article"}
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self.canonical = ""
        self.skip_depth = 0
        self.in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag in self.SKIP:
            self.skip_depth += 1
        if tag == "title":
            self.in_title = True
        if tag == "link" and attributes.get("rel", "").lower() == "canonical":
            self.canonical = attributes.get("href") or ""
        if tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP and self.skip_depth:
            self.skip_depth -= 1
        if tag == "title":
            self.in_title = False
        if tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
        if not self.skip_depth:
            self.parts.append(data)


def extract_article(url: str) -> dict[str, Any]:
    safe_url = validate_public_url(url)
    opener = build_opener(SafeRedirectHandler())
    request = Request(safe_url, headers={"User-Agent": "SourceAndStoryResearch/1.0", "Accept": "text/html, text/plain"})
    try:
        with opener.open(request, timeout=12) as response:
            final_url = validate_public_url(response.geturl())
            content_type = response.headers.get_content_type()
            if content_type not in ("text/html", "text/plain", "application/xhtml+xml"):
                raise ServiceError(415, f"Unsupported page type: {content_type}. Paste the article text instead.")
            raw = response.read(MAX_BODY + 1)
            if len(raw) > MAX_BODY:
                raise ServiceError(413, "The page is larger than the 1 MB extraction limit.")
            charset = response.headers.get_content_charset() or "utf-8"
            body = raw.decode(charset, errors="replace")
    except ServiceError:
        raise
    except HTTPError as exc:
        raise ServiceError(502, f"The source server returned HTTP {exc.code}. Paste the article text instead.") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise ServiceError(502, f"Could not retrieve this source ({exc}). Paste the article text instead.") from exc
    parser = ArticleParser()
    if content_type == "text/plain":
        title = ""
        text = body
    else:
        parser.feed(body)
        title = re.sub(r"\s+", " ", " ".join(parser.title_parts)).strip()
        text = re.sub(r"[ \t]+\n", "\n", html.unescape(" ".join(parser.parts)))
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) < 80:
        raise ServiceError(422, "Not enough article text could be extracted. Paste the article text instead.")
    canonical = urljoin(final_url, parser.canonical) if parser.canonical else final_url
    validate_public_url(canonical)
    return {"title": title[:240], "url": canonical, "text": text[:MAX_SOURCE_TEXT], "status": "extracted"}


def word_count(text: str) -> int:
    return len(WORD_RE.findall(text or ""))


def writing_metrics(text: str) -> dict[str, Any]:
    sentences = [sentence.strip() for sentence in SENTENCE_RE.split(text.strip()) if sentence.strip()]
    words = word_count(text)
    return {
        "word_count": words,
        "character_count": len(text),
        "reading_time_minutes": max(1, (words + 219) // 220) if words else 0,
        "average_words_per_sentence": round(words / len(sentences), 1) if sentences else 0,
        "sentence_count": len(sentences),
    }


def analyze_writing(text: str) -> dict[str, Any]:
    if not isinstance(text, str) or len(text) > MAX_SOURCE_TEXT:
        raise ServiceError(400, f"Draft must be text no longer than {MAX_SOURCE_TEXT:,} characters.")
    suggestions: list[dict[str, Any]] = []
    matcher = re.compile(r"[^.!?]+(?:[.!?]+|$)")
    for match in matcher.finditer(text):
        passage = match.group(0)
        words = WORD_RE.findall(passage)
        if len(words) >= 30:
            trimmed = passage.strip()
            start = match.start() + len(passage) - len(passage.lstrip())
            replacement = _split_sentence(trimmed)
            suggestions.append(_suggestion(text, start, trimmed, "long_sentence",
                "This sentence is long enough that readers may lose its main point.", replacement,
                "Break the sentence at a natural idea boundary, while keeping its qualifications and details."
                if replacement != trimmed else
                "No safe automatic split is suggested; edit the passage manually and preserve its meaning and qualifications."))
    for phrase in FILLER_PHRASES:
        for match in re.finditer(rf"\b{re.escape(phrase)}\b", text, re.IGNORECASE):
            passage = match.group(0)
            replacement = "" if phrase in {"basically", "actually", "very", "really"} else {
                "in order to": "to", "it is important to note that": "", "it should be noted that": "",
                "at this point in time": "now", "due to the fact that": "because", "in terms of": "for",
            }[phrase]
            suggestions.append(_suggestion(text, match.start(), passage, "filler",
                "This phrase may add words without adding meaning.", replacement,
                "Removing or simplifying the phrase makes the sentence more direct."))
    for match in re.finditer(r"\b(?:is|are|was|were|be|been|being)\s+(?:\w+ed|built|made|known|given|shown|written|found)\b", text, re.IGNORECASE):
        passage = match.group(0)
        suggestions.append(_suggestion(text, match.start(), passage, "possible_passive",
            "This may be passive voice; the actor is not explicit in this short phrase.", passage,
            "Consider naming the actor if that information is known. This heuristic can produce false positives."))
    for term, explanation in JARGON.items():
        for match in re.finditer(rf"\b{re.escape(term)}\b", text, re.IGNORECASE):
            suggestions.append(_suggestion(text, match.start(), match.group(0), "possible_jargon",
                f"This term may need context for a general reader. {explanation}", match.group(0),
                "Define the term briefly on first use if it is important to the story."))
    suggestions.sort(key=lambda item: (item["start"], item["category"]))
    unique: dict[tuple[int, int, str], dict[str, Any]] = {}
    for item in suggestions:
        unique[(item["start"], item["end"], item["category"])] = item
    suggestions = list(unique.values())
    if os.environ.get("SIGNALDESK_LLM_API_KEY"):
        model_suggestions = _provider_json(
            "For the supplied heuristic findings, return JSON {suggestions:[{id,replacement,why,explanation}]}. Only improve the listed suggestions. Keep each id unchanged, preserve meaning and technical precision, and do not invent facts. Do not accept or apply any edit.",
            json.dumps({"draft": text, "suggestions": [
                {"id": item["id"], "passage": item["passage"], "category": item["category"],
                 "why": item["why"], "replacement": item["replacement"]}
                for item in suggestions
            ]}),
        )
        if not isinstance(model_suggestions, dict) or not isinstance(model_suggestions.get("suggestions"), list):
            raise ServiceError(502, "The model returned malformed writing suggestions.")
        by_id = {item["id"]: item for item in suggestions}
        for item in model_suggestions["suggestions"]:
            if not isinstance(item, dict) or item.get("id") not in by_id:
                raise ServiceError(502, "The model returned a writing suggestion with an unknown ID.")
            if not all(isinstance(item.get(field), str) for field in ("replacement", "why", "explanation")):
                raise ServiceError(502, "The model returned an incomplete writing suggestion.")
            by_id[item["id"]].update({field: item[field] for field in ("replacement", "why", "explanation")})
    return {
        "metrics": writing_metrics(text),
        "suggestions": suggestions,
        "mode": "configured model assistance" if os.environ.get("SIGNALDESK_LLM_API_KEY") else "deterministic",
    }


def get_writing_metrics(text: Any) -> dict[str, Any]:
    if not isinstance(text, str) or len(text) > MAX_SOURCE_TEXT:
        raise ServiceError(400, f"Draft must be text no longer than {MAX_SOURCE_TEXT:,} characters.")
    return writing_metrics(text)


def _suggestion(text: str, start: int, passage: str, category: str, why: str, replacement: str, explanation: str) -> dict[str, Any]:
    end = start + len(passage)
    identity = f"{start}:{end}:{category}:{passage}"
    return {
        "id": hashlib.sha256(identity.encode()).hexdigest()[:14],
        "start": start, "end": end, "passage": passage, "category": category,
        "occurrence": len(re.findall(re.escape(passage), text[:start])),
        "why": why, "replacement": replacement, "explanation": explanation, "status": "pending",
    }


def _split_sentence(sentence: str) -> str:
    paired_question = re.match(
        r"^(?P<subject>.+?)\s+is not only\s+(?P<first>.+?), but whether\s+(?P<second>.+?)[.!?]?$",
        sentence, re.IGNORECASE,
    )
    if paired_question:
        first = paired_question.group("first")
        second = paired_question.group("second").rstrip(".!?")
        return f"First, identify {first}. Then consider whether {second}."
    if ";" in sentence:
        left, right = sentence.split(";", 1)
        left = left.rstrip(" ,")
        right = right.strip()
        if right:
            if left and left[-1] not in ".!?":
                left += "."
            right = right[0].upper() + right[1:]
            return f"{left} {right}"
    return sentence


def _check_sources(sources: Any) -> list[dict[str, Any]]:
    if not isinstance(sources, list) or not MIN_SOURCES <= len(sources) <= MAX_SOURCES:
        raise ServiceError(400, f"Add {MIN_SOURCES}–{MAX_SOURCES} sources before creating a research brief.")
    checked = []
    seen = set()
    for source in sources:
        if not isinstance(source, dict):
            raise ServiceError(400, "Each source must be an object.")
        source_id = str(source.get("id") or "")
        text = source.get("text")
        title = str(source.get("title") or "").strip()
        url = str(source.get("url") or "").strip()
        if not source_id or source_id in seen:
            raise ServiceError(400, "Every source needs a unique, stable ID.")
        if not title or not isinstance(text, str) or len(text.strip()) < MIN_SOURCE_TEXT:
            raise ServiceError(400, f"Source {title or source_id} needs a title and at least {MIN_SOURCE_TEXT} characters of text.")
        if len(text) > MAX_SOURCE_TEXT:
            raise ServiceError(413, "A source is larger than the 100 KB limit.")
        if url:
            validate_public_url(url)
        if source.get("status") not in ("processed", "extracted"):
            raise ServiceError(400, f"Source {title} was not processed successfully.")
        seen.add(source_id)
        checked.append({**source, "id": source_id, "title": title, "url": url, "text": text.strip()})
    return checked


def process_sources(sources: Any) -> list[dict[str, Any]]:
    if not isinstance(sources, list) or not 1 <= len(sources) <= MAX_SOURCES:
        raise ServiceError(400, f"Add between 1 and {MAX_SOURCES} sources.")
    if any(not isinstance(item, dict) for item in sources):
        raise ServiceError(400, "Each source must be a JSON object.")
    result = []
    for original in sources:
        source = dict(original)
        source["id"] = str(source.get("id") or uuid.uuid4())
        source["text"] = str(source.get("text") or "")
        source["title"] = str(source.get("title") or "")
        source["url"] = str(source.get("url") or "")
        try:
            if not source.get("text", "").strip():
                supplied_title = source["title"].strip()
                extracted = extract_article(str(source.get("url") or ""))
                if not str(extracted.get("title") or "").strip():
                    if not supplied_title:
                        raise ServiceError(422, "No article title could be extracted. Add a source title and retry.")
                    extracted["title"] = supplied_title
                source.update(extracted)
                source["user_provided"] = False
            else:
                if len(source["text"]) > MAX_SOURCE_TEXT:
                    raise ServiceError(413, "A source is larger than the 100 KB limit.")
                if len(source["text"].strip()) < MIN_SOURCE_TEXT:
                    raise ServiceError(400, f"Pasted source text must contain at least {MIN_SOURCE_TEXT} characters.")
                if not str(source.get("title") or "").strip():
                    raise ServiceError(400, "Add a title for pasted source text.")
                source["title"] = str(source["title"]).strip()[:240]
                source["user_provided"] = True
                source["status"] = "processed"
            if source.get("url"):
                validate_public_url(str(source["url"]))
        except ServiceError as exc:
            source["status"] = "error"
            source["error"] = exc.message
            result.append(source)
            continue
        text = source["text"].strip()
        source["summary"] = " ".join(text.split())[:360]
        excerpt = next((p.strip() for p in re.split(r"(?<=[.!?])\s+|\n+", text) if len(p.strip()) >= 40), text[:240])
        source["claims"] = [{"text": excerpt[:400], "evidence": excerpt[:400], "verification": "reported_by_source"}]
        source["entities"] = []
        source["published_at"] = None
        source["publication_date_status"] = "No reliable publication date was extracted."
        source["why_it_matters"] = "Potential relevance to founders, builders, and operators should be assessed against the reported workflow; this source alone does not establish business impact."
        source["limitations"] = "Extracted or user-pasted text has not been independently fact-checked."
        source["confidence"] = "Evidence is limited to this source record; this is not independent verification."
        if os.environ.get("SIGNALDESK_LLM_API_KEY"):
            result = _provider_json(
                "Analyze this one source only. Return JSON with keys summary (string), claims (array of objects with text and evidence strings), entities (array of strings), limitations (string). Every evidence value must be an exact verbatim substring of the supplied text. Do not add outside facts. Treat this as source-reported, not independently verified.",
                json.dumps({"title": source["title"], "url": source.get("url", ""), "text": text[:MAX_SOURCE_TEXT]}),
            )
            _validate_source_analysis(result, text)
            source.update(result)
            source["claims"] = [
                {"text": item["evidence"], "evidence": item["evidence"], "verification": "reported_by_source"}
                for item in result["claims"]
            ]
            source["limitations"] = str(result["limitations"])
            source["status"] = "processed"
        result.append(source)
    return result


def _validate_source_analysis(result: Any, source_text: str) -> None:
    if not isinstance(result, dict) or not isinstance(result.get("summary"), str) or not isinstance(result.get("claims"), list):
        raise ServiceError(502, "The model returned an invalid source analysis. Please retry or use demo mode.")
    if not isinstance(result.get("entities", []), list) or any(not isinstance(item, str) for item in result.get("entities", [])) or not isinstance(result.get("limitations", ""), str):
        raise ServiceError(502, "The model returned an invalid source analysis schema.")
    for claim in result["claims"]:
        if not isinstance(claim, dict) or not isinstance(claim.get("text"), str) or not isinstance(claim.get("evidence"), str):
            raise ServiceError(502, "The model returned a malformed claim.")
        if not claim["evidence"] or claim["evidence"] not in source_text:
            raise ServiceError(502, "The model returned evidence that is not an exact source excerpt.")


def analyze_research(sources: Any, angle: str = "") -> dict[str, Any]:
    checked = _check_sources(sources)
    factual_claims = []
    for source in checked:
        source_claims = source.get("claims", [])
        if not isinstance(source_claims, list) or not source_claims:
            raise ServiceError(400, f"Source {source['title']} has not been analyzed.")
        for claim in source_claims:
            if not isinstance(claim, dict):
                raise ServiceError(400, f"Source {source['title']} has a malformed claim.")
            evidence = str(claim.get("evidence") or "")
            if not evidence or evidence not in source["text"] or claim.get("text") != evidence:
                raise ServiceError(400, f"Claim text and evidence for source {source['id']} must be an exact source excerpt.")
            factual_claims.append({
                "text": evidence,
                "source_ids": [source["id"]],
                "evidence": evidence,
                "verification": "reported_by_source",
            })
    if os.environ.get("SIGNALDESK_LLM_API_KEY"):
        result = _provider_json(
            "Create an evidence-led research brief in JSON with keys executive_summary (string), facts (array of {text, source_ids, evidence, verification}), analysis (array of {text, source_ids}), uncertainties (array of {text, source_ids}), implications (array of {text, source_ids}), who_should_care (array of strings), opportunities (array of strings), angles (array of {id,title,rationale}), recommended_angle_id (string). Cite only supplied source IDs. Every factual claim needs evidence copied verbatim from one cited source and verification='reported_by_source'. Label interpretation in analysis. Describe disagreements and missing evidence instead of forcing agreement. Never claim independent verification.",
            json.dumps({"sources": [
                {"id": s["id"], "title": s["title"], "url": s.get("url", ""), "summary": s.get("summary", ""),
                 "claims": s.get("claims", []), "text": s["text"][:MAX_SOURCE_TEXT]}
                for s in checked
            ], "editorial_angle": angle}),
        )
        _validate_brief(result, checked)
        result["what_happened"] = result["facts"]
        result["developments"] = result["facts"]
        result["mode"] = "configured model · evidence-validated output"
        result["sources"] = [{"id": s["id"], "title": s["title"], "url": s.get("url", ""), "user_provided": s.get("user_provided", False)} for s in checked]
        result["source_records"] = checked
        return result
    source_names = ", ".join(source["title"] for source in checked)
    angles = [
        {"id": "what-changed", "title": "What changed, and what remains uncertain", "rationale": "Keeps source-reported developments distinct from unanswered questions."},
        {"id": "operator-impact", "title": "What builders and operators should do next", "rationale": "Connects the reported material to practical decisions without presenting interpretation as fact."},
    ]
    return {
        "mode": "evidence-first demo synthesis",
        "executive_summary": f"This brief organizes material from {len(checked)} supplied sources. The records cover: {source_names}. No independent verification has been performed.",
        "what_happened": factual_claims[:5],
        "developments": factual_claims[:5],
        "facts": factual_claims,
        "analysis": [{"text": f"Editorial interpretation: {angle.strip()}" if angle.strip() else "Editorial interpretation: compare the sources' reported details before deciding which development warrants action.", "source_ids": [], "label": "analysis"}],
        "uncertainties": [{"text": "The material has not been independently verified; source disagreement and omitted context may change the interpretation.", "source_ids": [], "label": "uncertainty"}],
        "implications": [
            {"text": "Founders and builders can use this brief as a starting point for follow-up questions, not as a substitute for checking the linked reporting.", "source_ids": [], "label": "analysis"},
        ],
        "who_should_care": [
            "Founders deciding whether to test an AI-assisted workflow.",
            "Builders and operators responsible for quality, review, and measurable outcomes.",
        ],
        "opportunities": [
            "Compare a small, supervised trial against a documented baseline.",
            "Investigate unresolved questions and seek independent reporting before making operational decisions.",
        ],
        "angles": angles,
        "recommended_angle_id": angles[0]["id"],
        "sources": [{"id": s["id"], "title": s["title"], "url": s.get("url", ""), "user_provided": s.get("user_provided", False)} for s in checked],
        "source_records": checked,
    }


def _validate_brief(brief: Any, sources: list[dict[str, Any]]) -> None:
    if not isinstance(brief, dict) or not isinstance(brief.get("executive_summary"), str):
        raise ServiceError(502, "The model returned an invalid research brief.")
    source_by_id = {source["id"]: source for source in sources}
    for key in ("facts", "analysis", "uncertainties", "implications", "who_should_care", "opportunities", "angles"):
        if not isinstance(brief.get(key), list):
            raise ServiceError(502, f"The model returned an invalid {key} section.")
    for fact in brief["facts"]:
        if not isinstance(fact, dict) or not isinstance(fact.get("source_ids"), list) or not fact["source_ids"]:
            raise ServiceError(502, "A factual claim is missing source citations.")
        if any(not isinstance(source_id, str) for source_id in fact["source_ids"]):
            raise ServiceError(502, "A factual claim contains an invalid source ID.")
        if not set(fact["source_ids"]).issubset(source_by_id):
            raise ServiceError(502, "A factual claim refers to an unknown source.")
        evidence = fact.get("evidence")
        if not isinstance(evidence, str) or not evidence or not any(evidence in source_by_id[sid]["text"] for sid in fact["source_ids"]):
            raise ServiceError(502, "A factual claim does not have a verbatim excerpt in its cited source.")
        if fact.get("text") != evidence:
            raise ServiceError(502, "Factual claim text must remain an exact source excerpt.")
        if fact.get("verification") != "reported_by_source":
            raise ServiceError(502, "Claim verification labels must remain source-reported.")
    for key in ("analysis", "uncertainties", "implications"):
        for item in brief[key]:
            if not isinstance(item, dict) or not isinstance(item.get("text"), str) or not isinstance(item.get("source_ids"), list):
                raise ServiceError(502, f"The model returned a malformed {key} item.")
            if any(not isinstance(source_id, str) for source_id in item["source_ids"]):
                raise ServiceError(502, f"A {key} item contains an invalid source ID.")
            if not set(item["source_ids"]).issubset(source_by_id):
                raise ServiceError(502, f"A {key} item refers to an unknown source.")
    for key in ("who_should_care", "opportunities"):
        if any(not isinstance(item, str) or not item.strip() for item in brief[key]):
            raise ServiceError(502, f"The model returned a malformed {key} item.")
    for angle in brief["angles"]:
        if not isinstance(angle, dict) or not all(isinstance(angle.get(field), str) for field in ("id", "title", "rationale")):
            raise ServiceError(502, "The model returned a malformed newsletter angle.")
    if brief.get("recommended_angle_id") not in {a["id"] for a in brief["angles"]}:
        raise ServiceError(502, "The recommended newsletter angle is not in the angle list.")


def generate_newsletter(brief: Any, angle_id: str = "") -> dict[str, Any]:
    if not isinstance(brief, dict) or not isinstance(brief.get("source_records"), list):
        raise ServiceError(400, "Provide a research brief with its source records.")
    if not brief["source_records"] or any(
        not isinstance(source, dict) or not isinstance(source.get("id"), str) or not isinstance(source.get("text"), str)
        for source in brief["source_records"]
    ):
        raise ServiceError(400, "Research brief source records are malformed.")
    source_ids = {str(s.get("id")) for s in brief["source_records"]}
    if len(source_ids) != len(brief["source_records"]) or "" in source_ids:
        raise ServiceError(400, "Research brief source IDs must be unique and nonempty.")
    claims = brief.get("facts", [])
    if not isinstance(claims, list):
        raise ServiceError(400, "Research brief facts must be a list.")
    for claim in claims:
        if not isinstance(claim, dict) or not isinstance(claim.get("source_ids"), list) or not claim["source_ids"] or any(not isinstance(item, str) for item in claim["source_ids"]) or not set(claim["source_ids"]).issubset(source_ids):
            raise ServiceError(400, "A brief claim refers to an unknown source.")
        if not isinstance(claim.get("evidence"), str) or not any(
            claim["evidence"] in source.get("text", "")
            for source in brief["source_records"] if source.get("id") in claim["source_ids"]
        ):
            raise ServiceError(400, "A brief claim is missing valid source evidence.")
    sources = brief["source_records"]
    headline = next((a["title"] for a in brief.get("angles", []) if a.get("id") == angle_id), "What the sources say — and what they don't")
    if os.environ.get("SIGNALDESK_LLM_API_KEY"):
        result = _provider_json(
            "Write a 300–500 word newsletter draft using only the supplied brief and source records. Return JSON with headline (string), text (string). Cite every source-reported factual sentence inline using [source-id], using only supplied IDs. Preserve uncertainty and qualifications. Clearly label editorial interpretation with 'Analysis:'. Do not add outside reporting, unsupported details, or invented quotes. Do not exceed 500 words.",
            json.dumps({"brief": brief, "selected_angle_id": angle_id, "selected_angle": headline}),
        )
        if not isinstance(result, dict) or not isinstance(result.get("headline"), str) or not isinstance(result.get("text"), str):
            raise ServiceError(502, "The model returned a malformed newsletter draft.")
        cited_ids = set(re.findall(r"\[([^\]]+)\]", result["text"]))
        if not cited_ids.issubset(source_ids):
            raise ServiceError(502, "The generated draft contains a citation to an unknown source.")
        if not cited_ids:
            raise ServiceError(502, "The generated draft has no source citations.")
        if word_count(result["text"]) < 250 or word_count(result["text"]) > 500:
            raise ServiceError(502, "The generated draft is outside the 250–500 word target. Please retry.")
        return {**result, "source_ids": sorted(cited_ids), "mode": "configured model · citation IDs validated"}
    sentences = []
    for claim in claims[:5]:
        cite = " ".join(f"[{sid}]" for sid in claim["source_ids"])
        statement = str(claim["text"]).rstrip(".!?")
        sentences.append(f"{statement} {cite}.")
    material = " ".join(sentences)
    if not material:
        raise ServiceError(400, "The selected brief has no cited factual material.")
    names = ", ".join(s["title"] for s in sources)
    article = (
        f"{headline}\n\n"
        f"Here is the development worth watching. The available source material comes from {names}. "
        "This draft is intentionally cautious: each factual statement below is attached to the supplied source record, "
        "and the records have not been independently verified.\n\n"
        f"What the sources report: {material}\n\n"
        "Why it matters — analysis: the practical question for a founder or operator is not only what was announced, "
        "but whether the reported change affects a real workflow, cost, or customer need. The source material here does "
        "not establish those downstream effects, so treat them as questions for follow-up rather than conclusions.\n\n"
        "Analysis for founders: define a baseline before changing a process. Identify one task, record the current time "
        "and error rate, then compare those measures with a supervised trial. Keep the scope small enough that a person "
        "can inspect mistakes and stop the trial if the result is worse. This is a suggested test plan, not an outcome "
        "reported by the sources.\n\n"
        "Analysis for builders and operators: ask who owns review, what kinds of mistakes matter, and whether the tool "
        "still helps after review time is counted. A quick demonstration does not answer those questions. Evidence from "
        "a representative task, including failures and exceptions, gives a more useful basis for a decision than a "
        "general claim about capability.\n\n"
        "A useful next step is to check the original links, confirm the timing and context, and ask which users would "
        "notice a measurable difference. That keeps the story useful without turning an early report into a prediction. "
        "Before publication, an editor should verify the source context, confirm that each excerpt supports its sentence, "
        "and add reporting if the story needs a stronger conclusion. The evidence in this draft is limited to the source "
        "records listed below; it adds no independent reporting."
    )
    return {"headline": headline, "text": article, "source_ids": sorted(source_ids), "mode": "template demo generation"}


def health() -> dict[str, Any]:
    key_present = bool(os.environ.get("SIGNALDESK_LLM_API_KEY"))
    model_present = bool(os.environ.get("SIGNALDESK_LLM_MODEL"))
    mode = "configured provider" if key_present and model_present else "provider setup incomplete" if key_present else "demo"
    return {"status": "ok", "mode": mode, "llm_configured": key_present and model_present}


def _provider_json(system_prompt: str, user_content: str) -> dict[str, Any]:
    api_key = os.environ.get("SIGNALDESK_LLM_API_KEY", "").strip()
    model = os.environ.get("SIGNALDESK_LLM_MODEL", "").strip()
    base_url = os.environ.get("SIGNALDESK_LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    if not api_key or not model:
        raise ServiceError(503, "Configure both SIGNALDESK_LLM_API_KEY and SIGNALDESK_LLM_MODEL, or clear the API key to use demo mode.")
    if not base_url.startswith(("https://", "http://")):
        raise ServiceError(500, "SIGNALDESK_LLM_BASE_URL must use HTTP or HTTPS.")
    payload = json.dumps({
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt + " Return valid JSON only, with no markdown fences."},
            {"role": "user", "content": user_content},
        ],
    }).encode("utf-8")
    request = Request(
        f"{base_url}/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=45) as response:
            response_body = response.read(2_000_001)
        if len(response_body) > 2_000_000:
            raise ServiceError(502, "The model response exceeded the 2 MB limit.")
        envelope = json.loads(response_body)
        content = envelope["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise ValueError("Model content is not a JSON string.")
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            raise ValueError("Model response is not a JSON object.")
        return parsed
    except ServiceError:
        raise
    except HTTPError as exc:
        raise ServiceError(502, f"The model provider returned HTTP {exc.code}. Check provider settings and retry.") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise ServiceError(502, f"The model provider request failed: {exc}. Retry or clear the key to use demo mode.") from exc
    except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValueError) as exc:
        raise ServiceError(502, "The model provider returned malformed JSON. Retry or use demo mode.") from exc
