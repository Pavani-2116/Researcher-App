import { useMemo, useState } from "react";
import { Check, CheckCheck, Clock3, FileText, Filter, PenLine, RotateCcw, Scissors, Sparkles, Type, WandSparkles } from "lucide-react";

const filterOptions = [
  ["all", "All issues", Filter],
  ["long_sentence", "Long sentence", Scissors],
  ["filler", "Filler phrase", Type],
  ["possible_jargon", "Jargon", Sparkles],
  ["possible_passive", "Passive voice", PenLine],
];

function Metric({ icon: Icon, label, value }) {
  return <div className="metric"><span className="metric-icon"><Icon size={14} /></span><span className="metric-value">{value}</span><small>{label}</small></div>;
}

export default function WritingPanel({ workspace }) {
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState("");
  const [replacement, setReplacement] = useState("");
  const visible = useMemo(() => filter === "all" ? workspace.suggestions : workspace.suggestions.filter((item) => item.category === filter), [filter, workspace.suggestions]);
  const beginEdit = (suggestion) => {
    setEditing(suggestion.id);
    setReplacement(suggestion.replacement);
  };
  const apply = (suggestion) => {
    workspace.updateSuggestion(suggestion.id, "accepted", replacement || suggestion.replacement);
    setEditing("");
  };
  return (
    <section className="panel writing-panel" id="writing">
      <div className="section-title">
        <div><span className="step-number purple-step">2</span><div><h2>Writing assistant</h2><p>Improve clarity, readability, and impact.</p></div></div>
        <button className="button button-outline small" disabled={!workspace.draft || workspace.busy === "writing"} onClick={workspace.analyzeDraft}>
          <WandSparkles size={14} /> {workspace.busy === "writing" ? "Reviewing…" : "Review draft"}
        </button>
      </div>
      <div className="metrics-strip">
        <Metric icon={FileText} label="Words" value={workspace.metrics?.word_count ?? 0} />
        <Metric icon={Type} label="Sentences" value={workspace.metrics?.sentence_count ?? 0} />
        <Metric icon={PenLine} label="Avg. sentence" value={`${workspace.metrics?.average_words_per_sentence ?? 0} words`} />
        <Metric icon={Clock3} label="Reading time" value={`${workspace.metrics?.reading_time_minutes ?? 0} min`} />
        <div className="readability"><span>Readability</span><strong>{workspace.metrics ? workspace.metrics.average_words_per_sentence <= 18 ? "Clear" : "Review" : "—"}</strong><span className={`readability-ring ${workspace.metrics && workspace.metrics.average_words_per_sentence > 18 ? "needs-review" : ""}`}><Check size={17} /></span></div>
      </div>
      <p className="metrics-caption">Length indicators, not a quality score. Reading time assumes 220 words/minute; “Clear/Review” is an average-sentence-length heuristic.</p>
      <div className="editor-label"><label htmlFor="draft-editor">DRAFT EDITOR</label><span>Original preserved · changes are yours to accept</span></div>
      <textarea id="draft-editor" className="writing-editor" value={workspace.draft} onChange={(event) => workspace.updateDraft(event.target.value)} placeholder="Write or paste a draft, or generate one from a research brief…" />
      <div className="editor-footer"><span>{workspace.metrics?.word_count ?? 0} words <i>·</i> {workspace.metrics?.character_count ?? 0} characters</span><button className="text-action" onClick={workspace.resetAnalysis}><RotateCcw size={12} /> Reset review</button></div>
      <div className="issue-heading"><div><strong>Editorial suggestions</strong><span>{workspace.suggestions.length} possible issues · heuristic checks</span></div><span className="issue-total">{workspace.suggestions.length}</span></div>
      <div className="filter-row">
        {filterOptions.map(([id, label, Icon]) => {
          const count = id === "all" ? workspace.suggestions.length : workspace.suggestions.filter((item) => item.category === id).length;
          return <button key={id} className={`filter-chip ${filter === id ? "active" : ""}`} onClick={() => setFilter(id)}><Icon size={12} />{label}<span>{count}</span></button>;
        })}
      </div>
      <div className="suggestion-list">
        {visible.length ? visible.slice(0, 3).map((suggestion) => (
          <article className={`suggestion-card ${suggestion.status}`} key={suggestion.id}>
            <div className="suggestion-card-head"><strong>{suggestion.category.replaceAll("_", " ")}</strong><span>{suggestion.status}</span></div>
            <p className="suggestion-passage">{suggestion.passage}</p>
            <p className="suggestion-why">{suggestion.why}</p>
            {editing === suggestion.id && <textarea className="replacement-field" rows={2} value={replacement} onChange={(event) => setReplacement(event.target.value)} aria-label="Suggested replacement" />}
            <div className="suggestion-actions">
              {suggestion.status === "accepted"
                ? <button className="text-action" onClick={() => workspace.undoSuggestion(suggestion.id)}><RotateCcw size={12} /> Undo</button>
                : <>
                  <button className="text-action" onClick={() => workspace.updateSuggestion(suggestion.id, "rejected", suggestion.replacement)}>Dismiss</button>
                  {editing === suggestion.id
                    ? <button className="button button-primary tiny" onClick={() => apply(suggestion)}><Check size={12} /> Accept edit</button>
                    : <button className="text-action purple-action" onClick={() => beginEdit(suggestion)}>Suggest revision</button>}
                </>}
            </div>
          </article>
        )) : <div className="suggestion-empty"><CheckCheck size={18} /><span>{workspace.draft ? "No issues in this category. Try another filter or review the draft." : "Your writing suggestions will appear here after you add or generate a draft."}</span></div>}
        {visible.length > 3 && <p className="more-issues">Showing 3 of {visible.length} suggestions. Refine the issue filter to review the rest.</p>}
      </div>
    </section>
  );
}
