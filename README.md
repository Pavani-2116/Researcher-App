# Source & Story — AI Editorial Workspace

**An evidence-first research and writing workspace for newsletter editors.**

Source & Story helps editors transform multiple articles and public sources into structured research briefs, discover potential newsletter angles, and improve their writing while retaining editorial control.

## Live application

**Live Demo:** https://researcher-app.onrender.com/

**GitHub Repository:** https://github.com/Pavani-2116/Researcher-App

**Product & Engineering Note:** [View product note](docs/product-engineering-note.md)

**Sample Editorial:** [View sample editorial](samples/sample-editorial.md)

**Before-and-After Example:** [View writing improvement example](samples/before-after.md)

---

## 1. Problem and product approach

Newsletter editors do more than summarize articles. They need to identify meaningful developments, distinguish reported facts from interpretation, understand why a development matters to their audience, and communicate it clearly.

Source & Story addresses this workflow through two connected capabilities:

- **Research Assistant:** Processes multiple sources and produces a structured, evidence-linked research brief.
- **Writing Assistant:** Evaluates a draft, identifies writing issues, and offers suggestions that writers can individually accept or reject.

The primary user is a newsletter editor researching AI developments for founders, builders, and business operators.

## 2. Features

### Research Assistant

- Accepts 3–10 source records.
- Supports pasted article or social-post text and public article URLs.
- Extracts content from accessible public URLs.
- Provides explicit source statuses and extraction errors.
- Produces structured research briefs.
- Separates source-supported facts, analysis, and uncertainty.
- Highlights audience relevance, practical opportunities, and newsletter angles.
- Retains original source links and evidence references.
- Generates newsletter drafts from the research brief.

### Writing Assistant

- Identifies long sentences and difficult phrasing.
- Detects selected filler phrases.
- Flags possible passive voice.
- Identifies selected jargon and technical terms.
- Provides explanations and suggested rewrites.
- Allows writers to accept or reject individual suggestions.
- Preserves the original draft and supports comparison and undo.
- Displays writing metrics such as word count, sentence length, and reading time.

### Editorial workspace

- Save, reopen, and delete projects.
- Export editorial work as Markdown.
- Responsive React interface.
- SQLite-based local persistence.

## 3. Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 18, JavaScript, Vite |
| Backend | Python 3.10+ |
| API | Python standard-library HTTP server |
| Database | SQLite |
| Styling | CSS |
| Deployment | Docker, Render |
| Optional AI integration | OpenAI-compatible API |

## 4. Architecture

The application uses a single-origin architecture.

- React provides the research and writing interface.
- The Python backend handles API requests, source extraction, research processing, writing analysis, and project management.
- SQLite stores saved projects.
- The optional LLM provider can provide contextual research and writing assistance.
- Without an LLM API key, deterministic processing keeps the core demo workflow available.

### Main API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Application health |
| `POST /api/sources/extract` | Extract public source content |
| `POST /api/research/process` | Process source records |
| `POST /api/research/analyze` | Generate research brief |
| `POST /api/writing/analyze` | Analyze writing quality |
| `POST /api/writing/metrics` | Calculate writing metrics |
| `POST /api/newsletter/generate` | Generate newsletter draft |
| `GET/POST /api/projects` | Retrieve and save projects |
| `GET/DELETE /api/projects/{id}` | Manage individual projects |
| `GET /api/projects/{id}/export.md` | Export Markdown |

## 5. Research and writing workflow

### Research workflow

1. Add at least three source records.
2. Provide public article URLs or paste source text.
3. Process the sources.
4. Review source-linked evidence, facts, analysis, and uncertainty.
5. Identify a useful newsletter angle.
6. Generate an editorial draft.

### Writing workflow

1. Open a draft in the Writing Assistant.
2. Analyze the text.
3. Review detected issues and suggested rewrites.
4. Accept or reject suggestions individually.
5. Compare the original and revised versions.
6. Export the final editorial as Markdown.

## 6. AI usage and demo-mode disclosure

The application supports an optional server-side OpenAI-compatible model provider.

**The currently deployed application runs in deterministic demo mode without a configured model API key.**

In demo mode:

- Research summaries and cross-source briefs use deterministic templates.
- Newsletter generation uses template-based output.
- Writing feedback and metrics use deterministic rules and heuristics.
- The in-app sample source records are fictional demonstration fixtures.

These outputs should not be confused with live AI-powered research or independently verified reporting.

The separate sample editorial contains links to public research sources and is provided as an editorial example.

## 7. Deployment

The application is deployed as a Docker web service on Render.

- **Platform:** Render
- **Runtime:** Docker
- **Instance:** Free
- **Application URL:** https://researcher-app.onrender.com/
- **Mode:** Demo mode

### Deployment configuration

The deployed service uses the following environment variables:

| Variable | Value |
|---|---|
| `SIGNALDESK_HOST` | `0.0.0.0` |
| `SIGNALDESK_DB` | `/tmp/signaldesk.sqlite3` |

No paid model API key is required for the current demo deployment.

**Free-tier limitations:** The service may spin down after inactivity and take time to respond when restarted. The SQLite database uses temporary storage, so saved data may not survive restarts or redeployments. Persistent storage is not configured.

## 8. Run locally

### Prerequisites

- Python 3.10+
- Node.js 20.19+ or 22.12+
- npm

### Install frontend dependencies

```powershell
npm --prefix .\frontend ci
```

### Start backend

Open a terminal in the project directory:

```powershell
py -3 -m backend.app
```

The backend normally starts at:

```text
http://127.0.0.1:8000
```

### Start frontend

Open a second terminal:

```powershell
npm --prefix .\frontend run dev
```

Open the Vite URL, normally:

```text
http://127.0.0.1:5173
```

### Verify backend health

Open:

```text
http://127.0.0.1:8000/api/health
```

Example demo response:

```json
{
  "status": "ok",
  "mode": "demo",
  "llm_configured": false
}
```

## 9. Environment variables

| Variable | Required | Description |
|---|---|---|
| `SIGNALDESK_LLM_API_KEY` | No | Server-side model API key |
| `SIGNALDESK_LLM_BASE_URL` | No | OpenAI-compatible API base URL |
| `SIGNALDESK_LLM_MODEL` | No | Model identifier |
| `SIGNALDESK_DB` | No | SQLite database path |
| `SIGNALDESK_HOST` | No | Backend bind address |
| `PORT` | No | Server listening port |
| `SIGNALDESK_CORS_ORIGINS` | No | Allowed frontend origins |

Never commit API keys or other secrets to GitHub.

## 10. Testing

Run backend tests:

```powershell
py -3 -m unittest discover -s backend\tests -v
```

Build the frontend:

```powershell
npm --prefix .\frontend run build
```

The project includes tests for research processing, writing heuristics, source evidence references, URL validation, model failures, project storage, and Markdown export.

A full live model-provider workflow requires a configured provider. No such integration is claimed for the current demo deployment.

## 11. Product decisions and trade-offs

### What was prioritized

- An end-to-end research-to-editorial workflow.
- Evidence references and separation of facts from interpretation.
- Writer control through individual suggestion acceptance and rejection.
- Clear demo-mode disclosure.
- Simple deployment and a lightweight interface.

### What was deliberately left out

- Full publishing and newsletter distribution.
- User authentication and collaborative editing.
- Paid model integration in the deployed demo.
- Production-grade monitoring and infrastructure.
- Advanced source verification and fact-checking.

### How success could be measured

- Time taken to produce a usable research brief.
- Percentage of source claims with traceable evidence.
- Number of useful newsletter angles identified.
- Percentage of writing suggestions accepted by editors.
- Reduction in editing time without loss of factual accuracy.

## 12. Known limitations and future improvements

- Some websites block automated extraction or require authentication.
- Pasted text is available as a fallback when extraction fails.
- Deterministic demo output is not equivalent to live AI research synthesis.
- Passive voice and jargon detection are heuristic and may produce false positives.
- The free deployment does not provide persistent SQLite storage.
- Authentication, backups, monitoring, and production-grade security remain future work.

With another day of development, priorities would include persistent managed storage, authenticated access, stronger source-to-claim verification, improved extraction coverage, and a configured LLM provider with robust output validation.

## 13. Deliverables

| Assignment deliverable | Project resource |
|---|---|
| Working application | [Live Demo](https://researcher-app.onrender.com/) |
| Source code | [GitHub Repository](https://github.com/Yamuna052005/Researcher-App) |
| Product and engineering note | [Product Note](docs/product-engineering-note.md) |
| Sample editorial | [Sample Editorial](samples/sample-editorial.md) |
| Before-and-after example | [Writing Example](samples/before-after.md) |

## 14. AI tooling disclosure

GitHub Copilot was used as an AI coding assistant during development.

The application implementation, project integration, deployment configuration, and workflow testing were carried out as part of this project.

The deployed application currently uses deterministic demo processing. No live model-provider integration is claimed.

---

**Source & Story — Helping editors move from information to insight, and from insight to clear writing.**
