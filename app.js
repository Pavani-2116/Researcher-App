(() => {
  "use strict";

  const apiBase = (document.querySelector('meta[name="api-base"]')?.content || "").replace(/\/$/, "");
  const state = {
    id: null, title: "Untitled research brief", sources: [], brief: null, angleId: "",
    originalDraft: "", draft: "", suggestions: [], undoStack: [], articleHeadline: "",
    originalMetrics: null, draftMetrics: null,
  };
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let editingSuggestion = null;

  async function api(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  function notice(message, success = false) {
    const box = $("#notice");
    box.textContent = message;
    box.hidden = false;
    box.classList.toggle("success", success);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (success) window.setTimeout(() => { box.hidden = true; }, 4000);
  }

  function busy(button, value, label) {
    if (value) {
      button.dataset.label = button.textContent;
      button.disabled = true;
      button.textContent = label || "Working…";
    } else {
      button.disabled = false;
      button.textContent = button.dataset.label || button.textContent;
    }
  }

  function switchView(name) {
    document.querySelectorAll(".nav-item").forEach((item) => {
      const active = item.dataset.view === name;
      item.classList.toggle("active", active);
      item.setAttribute("aria-current", active ? "page" : "false");
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.hidden = view.id !== `view-${name}`;
      view.classList.toggle("active", !view.hidden);
    });
    if (name === "saved") loadSaved();
    if (name === "writing") renderMetrics();
  }
  document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));

  function renderSources() {
    $("#source-count").textContent = `${state.sources.length} / 10 sources`;
    const list = $("#source-list");
    list.replaceChildren();
    state.sources.forEach((source) => {
      const card = document.createElement("article");
      card.className = "source-card";
      const details = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = source.title || "Untitled source";
      const status = document.createElement("span");
      status.className = `source-status${source.status === "error" ? " error" : ""}`;
      status.textContent = source.status === "processed" || source.status === "extracted" ? "READY" : source.status === "error" ? "NEEDS ATTENTION" : "NOT PROCESSED";
      const description = document.createElement("p");
      description.textContent = source.user_provided ? "Pasted by you · not independently verified" : (source.text ? "Source text supplied" : "URL extraction pending");
      details.append(title, description, status);
      const remove = document.createElement("button");
      remove.className = "remove-source";
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${source.title || "source"}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        state.sources = state.sources.filter((item) => item.id !== source.id);
        invalidateBrief();
        renderSources();
        syncProjectLabel();
      });
      card.append(details, remove);
      if (source.url) {
        const link = document.createElement("a");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = source.url;
        card.append(link);
      }
      if (source.error) {
        const error = document.createElement("p");
        error.className = "source-text";
        error.textContent = source.error;
        card.append(error);
      } else if (source.text && source.text.trim()) {
        const excerpt = document.createElement("p");
        excerpt.className = "source-text";
        excerpt.textContent = source.text.slice(0, 420);
        card.append(excerpt);
      }
      list.append(card);
    });
    $("#process-sources").disabled = state.sources.length < 1;
  }

  function invalidateBrief() {
    state.brief = null;
    state.angleId = "";
    state.articleHeadline = "";
    $("#brief-panel").hidden = true;
    $("#generate-newsletter").disabled = true;
    $("#export-article").disabled = true;
    $("#studio-status").textContent = "The source list changed. Rebuild the brief before generating or exporting a newsletter.";
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "Research sources changed. Rebuild the brief and generate a fresh newsletter draft before exporting. The prior draft remains available in Writing Lab.";
    $("#newsletter-preview").replaceChildren(message);
  }

  $("#add-source").addEventListener("click", () => {
    if (state.sources.length >= 10) return notice("A research session can include at most 10 sources.");
    const title = $("#source-title").value.trim();
    const url = $("#source-url").value.trim();
    const text = $("#source-text").value.trim();
    if (!text && !url) return notice("Add a public URL or paste article text.");
    if (text && !title) return notice("Add the source title when pasting article text.");
    if (url && !/^https?:\/\//i.test(url)) return notice("Source URLs must start with http:// or https://.");
    state.sources.push({ id: id(), title, url, text, status: "pending", user_provided: Boolean(text) });
    invalidateBrief();
    $("#source-title").value = "";
    $("#source-url").value = "";
    $("#source-text").value = "";
    renderSources();
    syncProjectLabel();
  });

  $("#load-demo").addEventListener("click", () => {
    state.sources = [
      { id: id(), title: "DEMO SOURCE 1 — Product release note (illustrative)", url: "https://example.com/demo/release-note", text: "DEMO FIXTURE — NOT LIVE REPORTING. This illustrative release note describes a fictional AI product update. The example says a team changed a workflow and published a new feature for evaluation. This text is a teaching fixture, not evidence about a real company or product.", user_provided: true, status: "processed" },
      { id: id(), title: "DEMO SOURCE 2 — Operator interview excerpt (illustrative)", url: "https://example.com/demo/operator-interview", text: "DEMO FIXTURE — NOT LIVE REPORTING. In this fictional interview, an operations lead says teams should measure time saved and error rates before adopting an AI tool. The example also notes that human review remains part of the described process. This text is synthetic and has not been independently verified.", user_provided: true, status: "processed" },
      { id: id(), title: "DEMO SOURCE 3 — Evaluation memo (illustrative)", url: "https://example.com/demo/evaluation-memo", text: "DEMO FIXTURE — NOT LIVE REPORTING. This fictional evaluation memo recommends testing an AI system on representative tasks and recording failures. It does not report real benchmark results or a real deployment. The example is included to demonstrate source IDs, short excerpts, and cautious editorial framing.", user_provided: true, status: "processed" },
    ];
    invalidateBrief();
    renderSources();
    notice("Illustrative demo fixtures loaded. They are synthetic, not live sources or verified reporting.", true);
  });

  $("#process-sources").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (state.sources.length < 3) return notice("Add at least three sources before building a full research brief.");
    busy(button, true, "Processing source records…");
    invalidateBrief();
    state.sources = state.sources.map((source) => ({ ...source, status: "pending", error: "" }));
    renderSources();
    try {
      const result = await api("/api/research/process", { method: "POST", body: JSON.stringify({ sources: state.sources }) });
      state.sources = result.sources;
      renderSources();
      const brief = await api("/api/research/analyze", { method: "POST", body: JSON.stringify({ sources: state.sources }) });
      state.brief = brief;
      state.angleId = brief.recommended_angle_id;
      renderBrief();
      $("#brief-panel").hidden = false;
      syncProjectLabel();
      notice("Research brief created. Source excerpts are reported material, not independent verification.", true);
    } catch (error) {
      notice(error.message);
    } finally {
      busy(button, false);
      renderSources();
    }
  });

  function renderBrief() {
    if (!state.brief) return;
    const brief = state.brief;
    const content = $("#brief-content");
    content.replaceChildren();
    const summary = document.createElement("p");
    summary.textContent = brief.executive_summary;
    content.append(summary);
    const facts = document.createElement("section");
    const factsTitle = document.createElement("h3");
    factsTitle.textContent = "Facts supported by source excerpts";
    facts.append(factsTitle);
    (brief.facts || []).forEach((claim) => {
      const card = document.createElement("div");
      card.className = "claim-card";
      const claimText = document.createElement("p");
      claimText.textContent = claim.text;
      const evidence = document.createElement("p");
      evidence.textContent = `Evidence: “${claim.evidence}”`;
      const cite = document.createElement("span");
      cite.className = "citation";
      cite.textContent = `${claim.verification.replaceAll("_", " ")} · ${claim.source_ids.join(", ")}`;
      card.append(claimText, evidence, cite);
      facts.append(card);
    });
    content.append(facts);
    const sourceNotes = document.createElement("section");
    const sourceNotesTitle = document.createElement("h3");
    sourceNotesTitle.textContent = "Source-by-source notes";
    sourceNotes.append(sourceNotesTitle);
    (brief.source_records || []).forEach((source) => {
      const card = document.createElement("div");
      card.className = "claim-card";
      const title = document.createElement("strong");
      title.textContent = source.title;
      const summary = document.createElement("p");
      summary.textContent = `Summary: ${source.summary || "No summary available."}`;
      const metadata = document.createElement("p");
      const entities = Array.isArray(source.entities) && source.entities.length ? source.entities.join(", ") : "None reliably extracted";
      const date = source.published_at || source.publication_date_status || "Not reliably extracted";
      metadata.textContent = `Publication date: ${date} · Entities: ${entities}`;
      const relevance = document.createElement("p");
      relevance.textContent = `Why it may matter: ${source.why_it_matters || "Review against audience needs; no broader impact is established."}`;
      const limits = document.createElement("p");
      limits.textContent = `Confidence / limitations: ${source.confidence || "Not independently verified."} ${source.limitations || ""}`;
      card.append(title, summary, metadata, relevance, limits);
      sourceNotes.append(card);
    });
    content.append(sourceNotes);
    const interpretation = document.createElement("section");
    const analysisHeading = document.createElement("h3");
    analysisHeading.textContent = "Analysis & uncertainty";
    interpretation.append(analysisHeading);
    [...(brief.analysis || []), ...(brief.uncertainties || []), ...(brief.implications || [])].forEach((item) => {
      const p = document.createElement("p");
      p.textContent = item.text;
      interpretation.append(p);
    });
    content.append(interpretation);
    const links = document.createElement("section");
    const linksHeading = document.createElement("h3");
    linksHeading.textContent = "Original sources";
    links.append(linksHeading);
    (brief.sources || []).forEach((source) => {
      const p = document.createElement("p");
      const a = document.createElement("a");
      a.href = source.url || "#";
      a.textContent = `${source.title}${source.user_provided ? " · user-provided" : ""}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      p.append(a);
      links.append(p);
    });
    content.append(links);
    renderAngleOptions();
  }

  function renderAngleOptions() {
    if (!state.brief) return;
    for (const selector of [$("#angle-select"), $("#studio-angle")]) {
      selector.replaceChildren();
      state.brief.angles.forEach((angle) => {
        const option = document.createElement("option");
        option.value = angle.id;
        option.textContent = `${angle.title} — ${angle.rationale}`;
        option.selected = angle.id === state.angleId;
        selector.append(option);
      });
      selector.disabled = false;
    }
    $("#studio-status").textContent = "Brief ready. Demo mode uses only supplied source excerpts; the template is not independent reporting.";
    $("#generate-newsletter").disabled = false;
  }
  $("#angle-select").addEventListener("change", (event) => { state.angleId = event.target.value; renderAngleOptions(); });
  $("#studio-angle").addEventListener("change", (event) => { state.angleId = event.target.value; renderAngleOptions(); });
  $("#copy-brief").addEventListener("click", async () => {
    if (!state.brief) return;
    const text = `${state.brief.executive_summary}\n\n${state.brief.facts.map((claim) => `${claim.text} [${claim.source_ids.join(", ")}]\nEvidence: ${claim.evidence}`).join("\n\n")}\n\nAnalysis: ${state.brief.analysis.map((item) => item.text).join(" ")}\n\nUncertainty: ${state.brief.uncertainties.map((item) => item.text).join(" ")}`;
    try { await navigator.clipboard.writeText(text); notice("Research brief copied.", true); } catch { notice("Clipboard access was blocked by the browser."); }
  });
  $("#create-draft").addEventListener("click", () => { switchView("studio"); $("#generate-newsletter").focus(); });

  $("#analyze-draft").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const text = $("#draft-editor").value;
    busy(button, true, "Checking draft…");
    try {
      const result = await api("/api/writing/analyze", { method: "POST", body: JSON.stringify({ text }) });
      state.originalDraft = text;
      state.draft = text;
      state.originalMetrics = result.metrics;
      state.draftMetrics = result.metrics;
      state.suggestions = result.suggestions;
      state.undoStack = [];
      renderSuggestions();
      renderMetrics(result.metrics);
      $("#suggestion-caption").textContent = `${result.suggestions.length} possible issue${result.suggestions.length === 1 ? "" : "s"} · heuristic checks, not definitive judgments`;
      notice("Draft analyzed. The original is unchanged; suggestions are optional.", true);
    } catch (error) { notice(error.message); }
    finally { busy(button, false); }
  });

  function renderMetrics(metrics = state.draftMetrics) {
    if (!metrics) return;
    const flagged = state.suggestions.length;
    const values = [
      ["WORDS", metrics.word_count], ["CHARACTERS", metrics.character_count],
      ["READING TIME", `${metrics.reading_time_minutes} min`], ["WORDS / SENTENCE", metrics.average_words_per_sentence],
      ["POSSIBLE ISSUES", flagged],
    ];
    $("#metrics").replaceChildren(...values.map(([label, value]) => {
      const card = document.createElement("div");
      card.className = "metric";
      const strong = document.createElement("strong");
      strong.textContent = String(value);
      const span = document.createElement("span");
      span.textContent = label;
      card.append(strong, span);
      return card;
    }));
  }

  function renderSuggestions() {
    const container = $("#suggestions");
    container.replaceChildren();
    if (!state.suggestions.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No heuristic flags found. That does not guarantee clarity or correctness.";
      container.append(empty);
    }
    state.suggestions.forEach((suggestion) => {
      const card = document.createElement("article");
      card.className = "suggestion";
      const top = document.createElement("div");
      top.className = "suggestion-top";
      const category = document.createElement("span");
      category.className = "category";
      category.textContent = suggestion.category.replaceAll("_", " ");
      const status = document.createElement("span");
      status.className = "status-tag";
      status.textContent = suggestion.status.toUpperCase();
      top.append(category, status);
      const passage = document.createElement("p");
      passage.className = "quoted-passage";
      passage.textContent = suggestion.passage;
      const why = document.createElement("p");
      why.textContent = suggestion.why;
      const explanation = document.createElement("p");
      explanation.textContent = `How the rewrite may help: ${suggestion.explanation}`;
      const actions = document.createElement("div");
      actions.className = "suggestion-actions";
      const review = document.createElement("button");
      review.className = "button button-outline";
      review.type = "button";
      review.textContent = suggestion.status === "pending" ? "Review & edit" : "Review";
      review.addEventListener("click", () => openSuggestion(suggestion.id));
      actions.append(review);
      if (suggestion.status === "accepted") {
        const undo = document.createElement("button");
        undo.className = "button button-quiet";
        undo.type = "button";
        undo.textContent = "Undo";
        undo.addEventListener("click", () => undoSuggestion(suggestion.id));
        actions.append(undo);
      }
      card.append(top, passage, why, explanation, actions);
      container.append(card);
    });
    $("#draft-editor").value = state.draft || $("#draft-editor").value;
    $("#original-text").textContent = state.originalDraft;
    $("#revised-text").textContent = state.draft;
    renderMetrics();
  }

  function openSuggestion(suggestionId) {
    const suggestion = state.suggestions.find((item) => item.id === suggestionId);
    if (!suggestion) return;
    editingSuggestion = suggestionId;
    $("#edit-heading").textContent = suggestion.category.replaceAll("_", " ");
    $("#edit-original").textContent = suggestion.passage;
    $("#edit-replacement").value = suggestion.replacement;
    $("#edit-dialog").showModal();
  }
  $("#reject-edit").addEventListener("click", () => updateSuggestion("rejected"));
  $("#accept-edit").addEventListener("click", () => updateSuggestion("accepted"));

  function currentPassageIndex(suggestion) {
    let offset = suggestion.start;
    for (const action of state.undoStack) {
      if (action.end <= suggestion.start) {
        offset += action.replacement.length - (action.end - action.start);
      } else if (action.start < suggestion.end && action.end > suggestion.start) {
        return -1;
      }
    }
    return state.draft.slice(offset, offset + suggestion.passage.length) === suggestion.passage ? offset : -1;
  }

  async function updateSuggestion(status) {
    const suggestion = state.suggestions.find((item) => item.id === editingSuggestion);
    if (!suggestion) return;
    if (status === "accepted") {
      const index = currentPassageIndex(suggestion);
      if (index < 0) {
        $("#edit-dialog").close();
        return notice("This exact original passage is no longer at its recorded position. The edit was not applied; reset analysis and review the current draft.");
      }
      state.undoStack.push({ id: suggestion.id, previousDraft: state.draft });
      const replacement = $("#edit-replacement").value;
      const action = state.undoStack[state.undoStack.length - 1];
      action.start = suggestion.start;
      action.end = suggestion.end;
      action.replacement = replacement;
      state.draft = state.draft.slice(0, index) + replacement + state.draft.slice(index + suggestion.passage.length);
    }
    suggestion.status = status;
    if (status === "accepted") suggestion.replacement = $("#edit-replacement").value;
    $("#edit-dialog").close();
    renderSuggestions();
    if (status === "accepted") {
      try {
        state.draftMetrics = await api("/api/writing/metrics", { method: "POST", body: JSON.stringify({ text: state.draft }) });
        renderMetrics();
      } catch (error) {
        notice(`Edit applied, but updated metrics could not be calculated: ${error.message}`);
      }
    }
    syncProjectLabel();
  }

  function undoSuggestion(suggestionId) {
    const last = state.undoStack[state.undoStack.length - 1];
    if (!last || last.id !== suggestionId) return notice("Undo edits in reverse acceptance order to preserve exact passage matching.");
    state.undoStack.pop();
    state.draft = last.previousDraft;
    const suggestion = state.suggestions.find((item) => item.id === suggestionId);
    if (suggestion) suggestion.status = "pending";
    renderSuggestions();
    api("/api/writing/metrics", { method: "POST", body: JSON.stringify({ text: state.draft }) })
      .then((metrics) => { state.draftMetrics = metrics; renderMetrics(); })
      .catch((error) => notice(`Edit undone, but updated metrics could not be calculated: ${error.message}`));
  }

  $("#draft-editor").addEventListener("input", (event) => {
    state.draft = event.target.value;
    $("#comparison").hidden = true;
    if (state.suggestions.length && state.draft !== state.originalDraft) {
      state.originalDraft = "";
      state.suggestions = [];
      state.undoStack = [];
      state.originalMetrics = null;
      state.draftMetrics = null;
      $("#suggestions").replaceChildren();
      $("#metrics").replaceChildren();
      $("#suggestion-caption").textContent = "Draft changed — run analysis again to refresh suggestions.";
    }
  });
  $("#reset-draft").addEventListener("click", () => {
    state.suggestions = [];
    state.undoStack = [];
    state.originalDraft = "";
    state.originalMetrics = null;
    state.draftMetrics = null;
    $("#suggestion-caption").textContent = "Run an analysis to see possible issues.";
    $("#suggestions").replaceChildren();
    $("#metrics").replaceChildren();
    $("#comparison").hidden = true;
    notice("Analysis reset. The current draft remains unchanged.", true);
  });
  $("#compare-draft").addEventListener("click", async () => {
    if (!state.originalDraft && !state.draft) return notice("Analyze a draft before comparing versions.");
    $("#original-text").textContent = state.originalDraft;
    $("#revised-text").textContent = $("#draft-editor").value;
    $("#comparison").hidden = false;
    try {
      const [originalMetrics, revisedMetrics] = await Promise.all([
        api("/api/writing/metrics", { method: "POST", body: JSON.stringify({ text: state.originalDraft || state.draft }) }),
        api("/api/writing/metrics", { method: "POST", body: JSON.stringify({ text: $("#draft-editor").value }) }),
      ]);
      $("#original-metrics").textContent = describeMetrics(originalMetrics);
      $("#revised-metrics").textContent = describeMetrics(revisedMetrics);
    } catch (error) { notice(`Could not calculate comparison metrics: ${error.message}`); }
    $("#comparison").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#close-comparison").addEventListener("click", () => { $("#comparison").hidden = true; });
  function describeMetrics(metrics) {
    return `${metrics.word_count} words · ${metrics.character_count} characters · ${metrics.reading_time_minutes} min · ${metrics.average_words_per_sentence} words/sentence`;
  }

  $("#generate-newsletter").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!state.brief) return notice("Create a research brief first.");
    busy(button, true, "Drafting from cited material…");
    try {
      const result = await api("/api/newsletter/generate", { method: "POST", body: JSON.stringify({ brief: state.brief, angle_id: state.angleId }) });
      state.articleHeadline = result.headline;
      $("#export-article").disabled = false;
      state.originalDraft = result.text;
      state.draft = result.text;
      state.suggestions = [];
      state.undoStack = [];
      state.originalMetrics = null;
      state.draftMetrics = null;
      renderNewsletter(result);
      $("#draft-editor").value = result.text;
      $("#studio-status").textContent = `${result.mode} · ${result.source_ids.length} source records · verify each claim before publication.`;
      syncProjectLabel();
      notice("Draft generated from the current brief only. Review claims and source links before use.", true);
    } catch (error) { notice(error.message); }
    finally { busy(button, false); }
  });

  function renderNewsletter(result) {
    const preview = $("#newsletter-preview");
    preview.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = result.headline;
    preview.append(heading);
    const paragraphs = result.text.split(/\n{2,}/).filter(Boolean);
    paragraphs.slice(1).forEach((paragraph) => {
      const p = document.createElement("p");
      p.textContent = paragraph;
      preview.append(p);
    });
    const sourceList = document.createElement("div");
    const headingSources = document.createElement("h3");
    headingSources.textContent = "Source records";
    sourceList.append(headingSources);
    const byId = new Map(state.brief.source_records.map((source) => [source.id, source]));
    result.source_ids.forEach((sourceId) => {
      const source = byId.get(sourceId);
      if (!source) return;
      const p = document.createElement("p");
      const a = document.createElement("a");
      a.href = source.url || "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = `[${sourceId}] ${source.title}`;
      p.append(a);
      sourceList.append(p);
    });
    preview.append(sourceList);
  }

  $("#open-writing").addEventListener("click", () => {
    if (!state.draft) return notice("Generate a newsletter draft first.");
    $("#draft-editor").value = state.draft;
    switchView("writing");
    $("#draft-editor").focus();
  });

  $("#export-article").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!state.brief || !state.articleHeadline || (!$("#draft-editor").value && !state.draft)) {
      return notice("Create a newsletter draft from the current research brief before exporting.");
    }
    busy(button, true, "Saving and exporting…");
    try {
      const saved = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ id: state.id || undefined, title: state.title, data: currentProjectData() }),
      });
      state.id = saved.id;
      window.location.assign(`${apiBase}/api/projects/${encodeURIComponent(state.id)}/export.md`);
      notice("Markdown export requested from the saved project.", true);
    } catch (error) { notice(error.message); }
    finally { busy(button, false); }
  });
  $("#copy-brief").addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.currentTarget.click();
  });
  function syncProjectLabel() {
    const title = state.articleHeadline || (state.brief ? "Research brief · " + (state.brief.sources[0]?.title || "") : "Untitled research brief");
    state.title = title.slice(0, 160);
    $("#project-label").textContent = state.title;
  }

  $("#save-button").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    busy(button, true, "Saving…");
    try {
      const saved = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ id: state.id || undefined, title: state.title, data: currentProjectData() }),
      });
      state.id = saved.id;
      notice("Project saved to the local SQLite database.", true);
    } catch (error) { notice(error.message); }
    finally { busy(button, false); }
  });

  function currentProjectData() {
    return {
      sources: state.sources, brief: state.brief, angleId: state.angleId, originalDraft: state.originalDraft,
      draft: $("#draft-editor").value, suggestions: state.suggestions,
      undoStack: state.undoStack, articleHeadline: state.articleHeadline,
      originalMetrics: state.originalMetrics, draftMetrics: state.draftMetrics,
    };
  }

  async function loadSaved() {
    try {
      const projects = await api("/api/projects");
      const list = $("#saved-list");
      list.replaceChildren();
      if (!projects.length) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.textContent = "No saved work yet. Use “Save work” to keep a research session or draft.";
        list.append(p);
        return;
      }
      projects.forEach((project) => {
        const card = document.createElement("article");
        card.className = "saved-card";
        const info = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = project.title;
        const metadata = document.createElement("p");
        metadata.textContent = `Updated ${new Date(project.updated_at).toLocaleString()}`;
        info.append(title, metadata);
        const actions = document.createElement("div");
        actions.className = "saved-actions";
        const open = document.createElement("button");
        open.className = "button button-outline";
        open.type = "button";
        open.textContent = "Open";
        open.addEventListener("click", () => openProject(project.id));
        const remove = document.createElement("button");
        remove.className = "button button-quiet";
        remove.type = "button";
        remove.textContent = "Delete";
        remove.addEventListener("click", async () => {
          if (!window.confirm(`Delete “${project.title}”? This cannot be undone.`)) return;
          try { await api(`/api/projects/${project.id}`, { method: "DELETE" }); await loadSaved(); notice("Saved project deleted.", true); }
          catch (error) { notice(error.message); }
        });
        actions.append(open, remove);
        card.append(info, actions);
        list.append(card);
      });
    } catch (error) { notice(error.message); }
  }

  async function openProject(projectId) {
    try {
      const project = await api(`/api/projects/${projectId}`);
      const data = project.data;
      state.id = project.id;
      state.title = project.title;
      state.sources = data.sources || [];
      state.brief = data.brief || null;
      state.angleId = data.angleId || "";
      state.originalDraft = data.originalDraft || "";
      state.draft = data.draft || "";
      state.suggestions = data.suggestions || [];
      state.undoStack = data.undoStack || [];
      state.articleHeadline = data.articleHeadline || "";
      state.originalMetrics = data.originalMetrics || null;
      state.draftMetrics = data.draftMetrics || null;
      $("#project-label").textContent = state.title;
      $("#draft-editor").value = state.draft;
      renderSources();
      if (state.brief) {
        renderBrief();
        $("#brief-panel").hidden = false;
        renderNewsletter({ headline: state.articleHeadline || "Saved newsletter draft", text: state.draft, source_ids: data.brief.sources.map((source) => source.id) });
        $("#export-article").disabled = !(state.articleHeadline && state.draft);
        $("#studio-status").textContent = "Opened saved work. Confirm original sources and evidence before publication.";
      } else {
        $("#export-article").disabled = true;
        $("#brief-panel").hidden = true;
        $("#newsletter-preview").innerHTML = '<p class="empty-state">No newsletter draft saved yet.</p>';
      }
      if (state.originalDraft) {
        $("#suggestion-caption").textContent = `${state.suggestions.length} saved suggestion${state.suggestions.length === 1 ? "" : "s"}`;
        renderSuggestions();
      } else {
        $("#suggestions").replaceChildren();
        $("#metrics").replaceChildren();
      }
      switchView(state.brief ? "research" : "writing");
      notice("Saved project reopened.", true);
    } catch (error) { notice(error.message); }
  }
  $("#refresh-saved").addEventListener("click", loadSaved);

  async function checkHealth() {
    try {
      const result = await api("/api/health");
      $("#mode-label").textContent = result.mode === "demo" ? "Demo mode" : result.mode === "provider setup incomplete" ? "Provider setup incomplete" : "Provider configured";
      $("#mode-detail").textContent = result.mode === "demo" ? "No external AI calls · rules only" : result.mode === "provider setup incomplete" ? "Set the server-side model name" : "Server-side model provider";
    } catch {
      $("#mode-label").textContent = "Offline";
      $("#mode-detail").textContent = "Start the local server to continue";
    }
  }
  renderSources();
  checkHealth();
})();
