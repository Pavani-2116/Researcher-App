import { useCallback, useEffect, useState } from "react";
import { api, newId, post } from "../api.js";

const readyStatus = (source) => ["processed", "extracted"].includes(source.status);

export function useWorkspace() {
  const [sources, setSources] = useState([]);
  const [brief, setBrief] = useState(null);
  const [angleId, setAngleId] = useState("");
  const [draft, setDraft] = useState("");
  const [originalDraft, setOriginalDraft] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [articleHeadline, setArticleHeadline] = useState("");
  const [newsletter, setNewsletter] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [originalMetrics, setOriginalMetrics] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [projectTitle, setProjectTitle] = useState("Untitled research brief");
  const [mode, setMode] = useState({ label: "Checking workspace", detail: "Local-first · evidence-led" });
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState("");
  const [view, setView] = useState("workspace");

  const inform = useCallback((message, success = false) => setNotice({ message, success }), []);
  const clearBrief = useCallback(() => {
    setBrief(null);
    setAngleId("");
    setArticleHeadline("");
    setNewsletter(null);
  }, []);

  useEffect(() => {
    let active = true;
    api("/api/health")
      .then((health) => {
        if (!active) return;
        const label = health.mode === "demo" ? "Demo mode" : health.mode === "provider setup incomplete" ? "Provider setup incomplete" : "Provider configured";
        const detail = health.mode === "demo" ? "Rules and templates · no AI provider" : health.mode === "provider setup incomplete" ? "Set the server-side model name" : "Server-side model provider";
        setMode({ label, detail });
      })
      .catch(() => active && setMode({ label: "Offline", detail: "Start the API server to continue" }));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draft.trim()) {
      setMetrics(null);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      post("/api/writing/metrics", { text: draft })
        .then((result) => active && setMetrics(result))
        .catch((error) => active && inform(`Could not update draft metrics: ${error.message}`));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draft, inform]);

  const updateDraft = useCallback((value) => {
    setDraft(value);
    setUndoStack([]);
    if (value !== originalDraft) setSuggestions([]);
  }, [originalDraft]);

  const addSource = useCallback(({ title, url, text }) => {
    if (sources.length >= 10) {
      inform("A research session can include at most 10 sources.");
      return false;
    }
    if (!text && !url) {
      inform("Add a public URL or paste article text.");
      return false;
    }
    if (text && !title) {
      inform("Add the source title when pasting article text.");
      return false;
    }
    if (url && !/^https?:\/\//i.test(url)) {
      inform("Source URLs must start with http:// or https://.");
      return false;
    }
    setSources((current) => [...current, {
      id: newId(), title, url, text, status: "pending", user_provided: Boolean(text),
    }]);
    clearBrief();
    inform("Source added. Build a fresh brief after processing at least three sources.", true);
    return true;
  }, [clearBrief, inform, sources.length]);

  const removeSource = useCallback((sourceId) => {
    setSources((current) => current.filter((source) => source.id !== sourceId));
    clearBrief();
  }, [clearBrief]);

  const loadSamples = useCallback((sampleSources) => {
    setSources(sampleSources);
    clearBrief();
    inform("Fictional sample sources loaded. They are synthetic, not live reporting.", true);
  }, [clearBrief, inform]);

  const processResearch = useCallback(async () => {
    if (sources.length < 3) return inform("Add at least three sources before building a full research brief.");
    setBusy("research");
    clearBrief();
    setSources((current) => current.map((source) => ({ ...source, status: "pending", error: "" })));
    try {
      const processed = await post("/api/research/process", { sources });
      setSources(processed.sources);
      const ready = processed.sources.filter(readyStatus);
      if (ready.length < 3) {
        const failed = processed.sources.filter((source) => source.status === "error").length;
        throw new Error(`Only ${ready.length} sources processed successfully. At least 3 are needed; ${failed} source(s) need retry or pasted text.`);
      }
      const result = await post("/api/research/analyze", { sources: ready });
      setBrief(result);
      setAngleId(result.recommended_angle_id);
      const failures = processed.sources.filter((source) => source.status === "error").length;
      setProjectTitle(`Research brief · ${result.sources[0]?.title || ""}`.slice(0, 160));
      inform(`Research brief created from ${ready.length} sources.${failures ? ` ${failures} failed source(s) remain excluded.` : ""} Excerpts are reported material, not independent verification.`, true);
    } catch (error) {
      inform(error.message);
    } finally {
      setBusy("");
    }
  }, [clearBrief, inform, sources]);

  const retrySource = useCallback(async (sourceId) => {
    const source = sources.find((item) => item.id === sourceId);
    if (!source) return;
    setBusy(`source-${sourceId}`);
    try {
      const response = await post("/api/research/process", { sources: [source] });
      const updated = response.sources?.[0];
      if (!updated) throw new Error("The server returned no source record.");
      setSources((current) => current.map((item) => item.id === sourceId ? updated : item));
      if (updated.status === "error") inform(updated.error || "Source processing failed. Paste the article text instead.");
      else inform("Source processed. Rebuild the brief to include it.", true);
    } catch (error) {
      inform(`Source retry failed: ${error.message}`);
    } finally {
      setBusy("");
    }
  }, [inform, sources]);

  const analyzeDraft = useCallback(async () => {
    setBusy("writing");
    try {
      const result = await post("/api/writing/analyze", { text: draft });
      setOriginalDraft(draft);
      setOriginalMetrics(result.metrics);
      setMetrics(result.metrics);
      setSuggestions(result.suggestions);
      setUndoStack([]);
      inform("Draft analyzed. The original is unchanged; suggestions are optional.", true);
    } catch (error) {
      inform(error.message);
    } finally {
      setBusy("");
    }
  }, [draft, inform]);

  const updateSuggestion = useCallback((suggestionId, status, replacement) => {
    const suggestion = suggestions.find((item) => item.id === suggestionId);
    if (!suggestion) return;
    if (status === "accepted") {
      let index = suggestion.start;
      for (const action of undoStack) {
        if (action.end <= suggestion.start) {
          index += action.replacement.length - (action.end - action.start);
        } else if (action.start < suggestion.end && action.end > suggestion.start) {
          index = -1;
          break;
        }
      }
      if (index < 0 || draft.slice(index, index + suggestion.passage.length) !== suggestion.passage) {
        return inform("That exact original passage is no longer at its recorded position. The edit was not applied; review the current draft again.");
      }
      const next = `${draft.slice(0, index)}${replacement}${draft.slice(index + suggestion.passage.length)}`;
      setUndoStack((current) => [...current, {
        id: suggestionId,
        previousDraft: draft,
        start: suggestion.start,
        end: suggestion.end,
        replacement,
      }]);
      setDraft(next);
      setSuggestions((current) => current.map((item) => item.id === suggestionId ? { ...item, status, replacement } : item));
    } else {
      setSuggestions((current) => current.map((item) => item.id === suggestionId ? { ...item, status } : item));
    }
  }, [draft, inform, suggestions, undoStack]);

  const undoSuggestion = useCallback((suggestionId) => {
    const last = undoStack.at(-1);
    if (!last || last.id !== suggestionId) return inform("Undo edits in reverse acceptance order to preserve exact passage matching.");
    setDraft(last.previousDraft);
    setUndoStack((current) => current.slice(0, -1));
    setSuggestions((current) => current.map((item) => item.id === suggestionId ? { ...item, status: "pending" } : item));
  }, [inform, undoStack]);

  const generateNewsletter = useCallback(async () => {
    if (!brief) return inform("Create a research brief first.");
    setBusy("newsletter");
    try {
      const result = await post("/api/newsletter/generate", { brief, angle_id: angleId });
      setNewsletter(result);
      setArticleHeadline(result.headline);
      setOriginalDraft(result.text);
      setDraft(result.text);
      setSuggestions([]);
      setUndoStack([]);
      setProjectTitle(result.headline.slice(0, 160));
      inform("Draft generated from the current brief only. Review claims and source links before use.", true);
    } catch (error) {
      inform(error.message);
    } finally {
      setBusy("");
    }
  }, [angleId, brief, inform]);

  const copyBrief = useCallback(async () => {
    if (!brief) return;
    const text = `${brief.executive_summary}\n\n${brief.facts.map((claim) => `${claim.text} [${claim.source_ids.join(", ")}]\nEvidence: ${claim.evidence}`).join("\n\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      inform("Research brief copied.", true);
    } catch {
      inform("Clipboard access was blocked by the browser.");
    }
  }, [brief, inform]);

  const projectData = useCallback(() => ({
    sources, brief, angleId, originalDraft, draft, suggestions, undoStack,
    articleHeadline, originalMetrics, draftMetrics: metrics,
  }), [angleId, articleHeadline, brief, draft, metrics, originalDraft, originalMetrics, sources, suggestions, undoStack]);

  const saveProject = useCallback(async (quiet = false) => {
    setBusy("save");
    try {
      const saved = await post("/api/projects", {
        id: projectId || undefined, title: projectTitle, data: projectData(),
      });
      setProjectId(saved.id);
      if (!quiet) inform("Project saved to the local workspace.", true);
      return saved;
    } catch (error) {
      inform(error.message);
      return null;
    } finally {
      setBusy("");
    }
  }, [inform, projectData, projectId, projectTitle]);

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await api("/api/projects"));
    } catch (error) {
      inform(error.message);
    }
  }, [inform]);

  const openProject = useCallback(async (id) => {
    setBusy("open");
    try {
      const project = await api(`/api/projects/${id}`);
      const data = project.data;
      setProjectId(project.id);
      setProjectTitle(project.title);
      setSources(data.sources || []);
      setBrief(data.brief || null);
      setAngleId(data.angleId || "");
      setOriginalDraft(data.originalDraft || "");
      setDraft(data.draft || "");
      setSuggestions(data.suggestions || []);
      setUndoStack(data.undoStack || []);
      setArticleHeadline(data.articleHeadline || "");
      setOriginalMetrics(data.originalMetrics || null);
      setMetrics(data.draftMetrics || null);
      setNewsletter(data.brief && data.draft ? {
        headline: data.articleHeadline || "Saved newsletter draft",
        text: data.draft,
        source_ids: data.brief.sources.map((source) => source.id),
      } : null);
      setView("workspace");
      inform("Saved project reopened.", true);
    } catch (error) {
      inform(error.message);
    } finally {
      setBusy("");
    }
  }, [inform]);

  const deleteProject = useCallback(async (id, title) => {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      await loadProjects();
      inform("Saved project deleted.", true);
    } catch (error) {
      inform(error.message);
    }
  }, [inform, loadProjects]);

  const exportNewsletter = useCallback(async () => {
    if (!brief || !articleHeadline || !draft) return inform("Generate a newsletter draft from the current research brief before exporting.");
    const saved = await saveProject(true);
    if (saved) window.location.assign(`/api/projects/${encodeURIComponent(saved.id)}/export.md`);
  }, [articleHeadline, brief, draft, inform, saveProject]);

  const setAngle = useCallback((id) => setAngleId(id), []);
  const resetAnalysis = useCallback(() => {
    setSuggestions([]);
    setUndoStack([]);
    setOriginalDraft("");
    setOriginalMetrics(null);
    inform("Analysis reset. The current draft remains unchanged.", true);
  }, [inform]);

  return {
    sources, brief, angleId, setAngle, draft, updateDraft, originalDraft,
    suggestions, updateSuggestion, undoSuggestion, metrics,
    originalMetrics, newsletter, projectId, projectTitle, mode, notice,
    dismissNotice: () => setNotice(null), busy, view, setView, projects,
    addSource, removeSource, loadSamples, processResearch, retrySource,
    analyzeDraft, generateNewsletter, copyBrief, saveProject, loadProjects,
    openProject, deleteProject, exportNewsletter, resetAnalysis, inform,
  };
}
