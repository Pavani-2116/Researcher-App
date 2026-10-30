# Source & Story — AI Editorial Workspace

Source & Story is an evidence-first editorial tool for turning multiple source records into a cautious newsletter draft, then improving the prose without giving up editorial control. It is a working local application, not a static mockup.

> **Demo mode:** without a server-side model key, source summaries and cross-source briefs use transparent, deterministic templates. The in-app sample source records are synthetic, not live reporting. The separate sample editorial links to public research sources and labels its analysis; never present the fictional app fixtures as verified facts.

## Features

- Add 3–10 pasted articles/social posts (at least 10 characters) or extract public article URLs, with source status and explicit errors.
- Block non-public/local URL destinations, revalidate redirects, cap fetch size and time, and offer paste-text fallback.
- Review source-linked excerpts, facts, analysis, uncertainty, audience fit, opportunities, angles, and original source links.
- Generate a bounded newsletter draft from the current brief and export Markdown.
- Check long sentences, filler, possible passive voice, and selected jargon with deterministic heuristics.
- Review/edit/accept/reject individual suggestions; preserve the original and compare or undo accepted changes.
- Save, reopen, and delete work in local SQLite.
- Optional server-side OpenAI-compatible provider for contextual research and writing assistance.

## Stack and architecture

- Frontend: React 18, JavaScript modules, and Vite. Reusable UI is organized by components, with API requests and workspace state separated into `src/api.js` and `src/hooks/useWorkspace.js`.
- Backend: Python 3.10+ standard-library `ThreadingHTTPServer`, `urllib`, and `sqlite3`.
- API and static UI are served from one origin. Configure an explicit comma-separated `SIGNALDESK_CORS_ORIGINS` allowlist only if hosting the frontend separately.
- Persistence: `backend/signaldesk.sqlite3` by default (ignored by Git); override with `SIGNALDESK_DB`.
- API endpoints: `GET /api/health`, `POST /api/sources/extract`, `POST /api/research/process`, `POST /api/research/analyze`, `POST /api/writing/analyze`, `POST /api/writing/metrics`, `POST /api/newsletter/generate`, `GET/POST /api/projects`, `GET/DELETE /api/projects/{id}`, and `GET /api/projects/{id}/export.md`.

## Project structure

```text
frontend/index.html   Vite application shell
frontend/src/App.jsx  Main responsive workspace
frontend/src/components/  Research, writing, source, output, navigation, and saved-work components
frontend/src/api.js   Shared API client
frontend/src/data/    Clearly labeled fictional sample sources
frontend/src/hooks/   Shared research and writing workflow state
frontend/src/styles.css  Responsive dashboard design system
frontend/package.json  React dependencies and development/build scripts
frontend/vite.config.js  Local API proxy and React build configuration
backend/app.py        Python HTTP server and API routes
backend/services/     Source extraction, research, writing, LLM and SQLite logic
backend/tests/        Focused standard-library tests
docs/                 Product and engineering decisions
samples/              Synthetic editorial and before/after example
.env.example          Placeholder-only local configuration
Dockerfile            Container build
render.yaml           Render Blueprint
```

## Run locally (Windows PowerShell)

The local app has two parts: a Python API and a React/Vite frontend. **Both must be running in separate PowerShell terminals** when using the Vite development page. Python 3.10+ and Node.js 20.19+ (or 22.12+) are required. No Python packages or AI-provider key are needed for demo mode.

### 1. First-time setup

Open PowerShell and change to the project folder. If you cloned the repository somewhere else, replace this path with your project folder:

```powershell
Set-Location 'C:\Users\surendra\OneDrive\Desktop\Research App'
npm --prefix .\frontend ci
```

`.env` is optional. The app runs in clearly labeled demo mode without it. To create a local environment file for optional settings, run:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

### 2. Start the Python backend

Open **Terminal 1** in VS Code (or a new PowerShell window), then run:

```powershell
Set-Location 'C:\Users\surendra\OneDrive\Desktop\Research App'
py -3 -m backend.app
```

Keep this terminal open. When the server starts, it prints a message containing `http://127.0.0.1:8000`. To stop it, press **Ctrl+C** in this terminal.

If `py -3` is not recognized or selects the wrong Python installation, check installed Python versions with `py -0p`, then run the backend using the path to Python 3.10 or newer, for example:

```powershell
& 'C:\Python314\python.exe' -m backend.app
```

### 3. Start the React frontend

Open **Terminal 2** in VS Code (leave Terminal 1 running), then run:

```powershell
Set-Location 'C:\Users\surendra\OneDrive\Desktop\Research App'
npm --prefix .\frontend run dev
```

Open the **Local** URL printed by Vite, normally <http://127.0.0.1:5173>. Keep this terminal open too. Vite forwards `/api` requests to the backend on port 8000.

### 4. Check that the backend is working

Open <http://127.0.0.1:8000/api/health> in a browser. A running backend returns JSON similar to:

```json
{"status":"ok","mode":"demo","llm_configured":false}
```

You can also check it from PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

### Run the built app without Vite (optional)

Use this instead of the two-terminal development setup when you want to test the production build locally:

```powershell
Set-Location 'C:\Users\surendra\OneDrive\Desktop\Research App'
npm --prefix .\frontend run build
py -3 -m backend.app
```

Then open <http://127.0.0.1:8000>. The Python server serves both the built frontend and API. Do not start the Vite server for this mode.

### Troubleshooting

- **Frontend opens but says the API is unreachable / “Failed to fetch”:** start or restart Terminal 1 with `py -3 -m backend.app`. The backend must remain running.
- **Health check does not open:** confirm the backend terminal has no startup error and that it printed port 8000. If another process already uses that port, close that process and restart the backend.
- **A URL source fails, but health returns `ok`:** the backend is working; the publication may block extraction or be unavailable. Retry with a public article URL or paste the source text.
- **TLS certificate error for a source:** refresh the computer's trusted certificates or use the paste-text fallback. Do not disable certificate verification.
- **`npm` is not recognized:** install Node.js, reopen PowerShell, and check `node --version` and `npm --version`.

The app reads optional values from a root `.env` file when the backend starts. See [Environment variables](#environment-variables) below. Never commit secrets.

### Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `SIGNALDESK_LLM_API_KEY` | No | Server-side API key for an OpenAI-compatible chat-completions endpoint. |
| `SIGNALDESK_LLM_BASE_URL` | No | Provider base URL; defaults to `https://api.openai.com/v1`. |
| `SIGNALDESK_LLM_MODEL` | With key | Model identifier selected for that provider. |
| `SIGNALDESK_DB` | No | SQLite file path; defaults to `backend/signaldesk.sqlite3`. |
| `SIGNALDESK_HOST` | No | Bind address; defaults to `127.0.0.1` for local safety. |
| `PORT` | No | Listening port; defaults to `8000`. |
| `SIGNALDESK_CORS_ORIGINS` | No | Comma-separated exact origins allowed for cross-origin browser requests. Empty by default. |

The server reads a local root `.env` file at startup without overriding variables already set in the process environment. Copy `.env.example` to `.env`, then fill in values only on your machine. Set secrets in the server environment, never in the browser or a committed file. If no provider is configured, deterministic checks and clearly labeled template mode still work. Provider failures or malformed output return explicit errors; they are not presented as successful analysis.

### Example API request

```powershell
$body = @{
  sources = @(
    @{ id = 'source-1'; title = 'First report'; url = ''; text = 'Paste source text here, preserving the original wording and important context.' },
    @{ id = 'source-2'; title = 'Second report'; url = ''; text = 'Paste a second source record here. Each record is analyzed individually before the cross-source brief.' },
    @{ id = 'source-3'; title = 'Third report'; url = ''; text = 'Paste a third source record here. Do not treat source-reported statements as independently verified.' }
  )
} | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/research/process' -ContentType 'application/json' -Body $body
```

## Tests

```powershell
Set-Location 'C:\Users\surendra\OneDrive\Desktop\Research App'
py -3 -m unittest discover -s backend\tests -v
npm --prefix .\frontend run build
```

The standard-library tests cover metrics and heuristic flags, immutable originals, source evidence references, unsupported source rejection, unsafe URL validation, model failures/malformed responses, `.env` parsing, HTTP health/research endpoints, Markdown export, and SQLite save/retrieval. A full live URL/model end-to-end run requires network access and a configured provider; no live source verification is claimed by this demo.

## Demo workflow

1. Start the server and choose **Load fictional sample sources** (synthetic fixture content).
2. Select **Process sources & build brief**; inspect each ID, quote, and warning.
3. Choose an angle, generate a draft, and open it in Writing Lab.
4. Analyze the draft; inspect a suggestion, edit it if useful, and accept or reject it.
5. Compare versions, save work, and export the Markdown from Editorial Studio.

The demo brief becomes available only with three successfully processed records. URL-only sources need an accessible public article page; inaccessible pages show an error instead of being treated as fetched. Without a model provider, newsletter generation uses a clearly labeled template based on the source excerpts, not an AI-written synthesis.

The separate [sample editorial](samples/sample-editorial.md) is a 300–500-word researched example with links to public sources. It is not presented as output from a configured model or as independently verified reporting. The in-app sample source set remains synthetic.

## Deployment

### Container / Render

The included `Dockerfile` and `render.yaml` run the app on port 8000. For the existing `Yamuna052005/Portfolio` repository, the Blueprint path is `OneDrive/Desktop/Research App/render.yaml` and the configured service root is this project folder.

1. Push a reviewed, project-only commit using the commands below.
2. In Render, choose **New → Blueprint**, connect `Yamuna052005/Portfolio`, and select `OneDrive/Desktop/Research App/render.yaml` as the Blueprint file.
3. Review the proposed web service and persistent disk, then apply the Blueprint.
4. If using a model provider, add its API key and model name under the service's secret environment variables; never add them to Git.
5. After deploy, open the assigned `/api/health` URL, verify it reports `ok`, and run a complete source-to-export workflow with real authorized sources before calling the service production-ready.

The persistent disk protects SQLite data across deploys. No deployment has been performed or tested as part of this implementation. If this folder is moved to the root of a new standalone repository, remove or change `rootDir` in `render.yaml` to match that repository layout.

```powershell
Set-Location 'C:\Users\surendra\OneDrive\Desktop\Research App'
docker build -t source-and-story .
docker run --rm -p 8000:8000 -e SIGNALDESK_HOST=0.0.0.0 source-and-story
```

## GitHub handoff

The project folder is inside the existing `C:\Users\surendra` Git repository; do not run `git init` or force-push. Check the configured remote and review the project-only diff before committing. These commands stage and commit only this folder, leaving unrelated staged changes out:

```powershell
git -C 'C:\Users\surendra' remote -v
git -C 'C:\Users\surendra' add -- 'OneDrive/Desktop/Research App'
git -C 'C:\Users\surendra' diff --cached -- 'OneDrive/Desktop/Research App'
git -C 'C:\Users\surendra' commit --only -m 'Add Source & Story editorial workspace' -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' -- 'OneDrive/Desktop/Research App'
git -C 'C:\Users\surendra' push origin main
```

Confirm `origin` points to the intended repository and that `main` is the intended branch before pushing. No commit or push was run automatically.

### Separate frontend/API

The API is same-origin by default. If a separate frontend is used, configure `<meta name="api-base" content="https://your-api.example">` in `frontend/index.html` and set `SIGNALDESK_CORS_ORIGINS` to the exact frontend origin. Do not use wildcard origins for a production deployment.

## Known limitations

- The no-key brief and article are templates, not model output, and include no independent source verification.
- Article extraction is intentionally small and cannot handle every page layout. It does not bypass login or paywall access.
- URL safety checks validate DNS responses and redirects, but a production deployment should also enforce network egress policy and DNS/IP pinning.
- Passive voice, sentence splitting, and jargon detection are approximate; readability is not a quality score.
- The default development server is not a hardened production server; use TLS termination, access controls, request logging/monitoring, backups, and a production-grade deployment review.
- SQLite persistence is local to the configured path; no authentication, collaboration, or retention policy is included.

## Product and sample deliverables

- [Product and engineering note](docs/product-engineering-note.md)
- [Researched sample editorial](samples/sample-editorial.md)
- [Writing before/after example](samples/before-after.md)

## AI tooling disclosure

This application was created with assistance from GitHub Copilot in VS Code. No live model provider was configured. The in-app source fixtures are synthetic; the separate editorial sample cites the public sources listed in that file. Research, writing analysis, and editing behavior were exercised locally; see the test and setup sections for reproducible checks.
