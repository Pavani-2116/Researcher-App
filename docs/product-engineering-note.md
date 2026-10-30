# Product & engineering note

## Product

**Primary user:** a newsletter editor who needs to turn several reports into a useful story without losing track of what a source actually supports.

**Core workflow:** add three or more source records → process each record → review a source-linked research brief → choose an angle → generate a cited draft → analyze readability → accept, edit, or reject individual suggestions → compare, save, and export.

The prototype prioritizes the evidence trail, explicit sample/demo labeling, individual source errors, deterministic writing checks, local persistence, and author control. Its built-in fictional sample records are titled as a product update, an operator interview, and a reliability test plan; they remain clearly marked as synthetic, not live reporting. A separate 300–500-word sample editorial cites public research sources and distinguishes their findings from editorial analysis. The prototype deliberately omits accounts, team collaboration, web search, CMS integrations, automatic publication, and claims of independent fact-checking.

## Engineering

The browser UI is a responsive React application built with Vite. Its shared workspace logic lives in a React hook, and research, source rows, writing review, saved work, navigation, and editorial output are separate components. `backend/app.py` runs a Python standard-library HTTP server; `backend/services/editorial.py` contains bounded URL extraction, source processing, model-provider integration, and SQLite persistence. Vite proxies `/api` during local frontend development; the production build is served with the API from one origin. Deployment can use the included multi-stage container and Render configuration.

Word count, sentence count, reading-time estimate, sentence length, filler phrase, possible passive voice, and selected jargon checks are deterministic heuristics. A server-configured OpenAI-compatible provider can add source summaries/claims, synthesis, drafting, and contextual rewrite suggestions. No provider key is needed for local demo mode. Provider output is schema-checked; evidence excerpts must match source text exactly, and cited source IDs must exist. These checks reduce errors but do not prove semantic accuracy.

Inaccessible, unsupported, oversized, empty, or unsafe URL sources receive an explicit per-source error and a paste-text path. URL extraction uses timeouts, public-address validation, redirect revalidation, a response-size cap, and does not attempt to bypass access controls. DNS validation is not a substitute for deployment-level network egress controls; deploy behind an outbound proxy or firewall for stronger SSRF containment.

## Editorial integrity

User-pasted material is labeled as such. A source excerpt supports “reported by this source,” not “independently verified.” Stable IDs link claims to source records; the UI carries original URLs and short excerpts. The no-key synthesis and article generator are explicitly labeled templates, not AI output. Synthetic demo fixtures are illustrative and must not be published as reporting. Model-created paraphrases remain subject to editorial fact-checking.

Interpretation, uncertainty, and practical implications are separated from source-reported facts. The editor must review all suggested edits; the original draft is kept separately, suggestions are never auto-applied, repeated text is tracked by occurrence, and accepted changes can be undone in reverse order.

## Evaluation

Measure time from source intake to approved draft, proportion of factual sentences with a valid source ID and exact excerpt, editor acceptance/rejection rates, corrections after publication, and blind reader ratings of clarity and preserved nuance. Evaluate writing changes with paired reader tests against the same original/revised text, checking comprehension and factual/qualification retention—not only shorter length or readability scores. Passive-voice and jargon checks are possible-issue heuristics, not definitive judgments.

Never automatically publish, invent missing evidence, remove a qualification or attribution, convert an uncertain report into a confirmed fact, silently rewrite the full draft, or replace a repeated passage without locating its intended occurrence.

## Next iteration

Add a production-grade DNS-pinned fetcher and egress policy, robust article extraction and publication-date provenance, a migration strategy, authenticated/team workspaces, model-provider adapters and retries, semantic citation audits, richer accessibility/browser testing, and review of privacy/retention requirements. The approximate 300–500-word goal should be validated against representative newsroom tasks before treating it as a product default.

**AI tooling disclosure:** this implementation was created with assistance from GitHub Copilot in VS Code. No provider key or live AI provider was configured for the local demo; the in-app fixtures are synthetic, while the separate editorial sample links to the public research it discusses. The README reports the local tests and checks used to validate the application.
