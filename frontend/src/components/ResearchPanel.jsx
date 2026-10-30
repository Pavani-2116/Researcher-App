import { useState } from "react";
import { ArrowRight, FilePlus2, Link2, LoaderCircle, Plus, Search, Sparkles } from "lucide-react";
import { createSampleSources } from "../data/sampleSources.js";
import SourceCard from "./SourceCard.jsx";
import BriefPanel from "./BriefPanel.jsx";

export default function ResearchPanel({ workspace }) {
  const [form, setForm] = useState({ title: "", url: "", text: "" });
  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const add = () => {
    if (workspace.addSource({ title: form.title.trim(), url: form.url.trim(), text: form.text.trim() })) {
      setForm({ title: "", url: "", text: "" });
    }
  };
  const pasteInstead = (source) => {
    const unsafe = source.error?.startsWith("Unsafe or invalid URL");
    setForm({ title: source.title || "", url: unsafe ? "" : source.url || "", text: "" });
    workspace.removeSource(source.id);
    workspace.inform(unsafe
      ? "This URL points to a local or private network address and was blocked for safety. It was not retained. Paste the article text or use a public article URL."
      : "Paste the article text, then add it as a new source record.", false);
  };
  return (
    <section className="panel research-panel" id="research">
      <div className="section-title">
        <div><span className="step-number">1</span><div><h2>Research assistant</h2><p>Turn your sources into an evidence-backed brief.</p></div></div>
        <button className="button button-outline small" onClick={() => workspace.loadSamples(createSampleSources())}><FilePlus2 size={14} /> Sample research</button>
      </div>
      <div className="source-form">
        <label className="source-field"><span>Source title</span><input name="title" value={form.title} onChange={change} placeholder="Report or article title" maxLength={240} /></label>
        <label className="source-field"><span>Original URL <em>optional with pasted text</em></span><input name="url" type="url" value={form.url} onChange={change} placeholder="https://publication.com/article" /></label>
        <label className="source-field source-text-field"><span>Article or post text <em>or leave blank to extract from URL</em></span><textarea name="text" value={form.text} onChange={change} rows={3} maxLength={100000} placeholder="Paste article, tweet, or post text here. Add a source title when pasting." /></label>
        <div className="source-form-footer">
          <span><Link2 size={13} /> Public URLs only; local and private network destinations are blocked.</span>
          <button className="button button-light small" onClick={add}><Plus size={14} /> Add source</button>
        </div>
      </div>
      <div className="source-list">
        <div className="source-list-heading"><span>YOUR SOURCES</span><span>{workspace.sources.length} / 10</span></div>
        {workspace.sources.length
          ? workspace.sources.map((source) => <SourceCard key={source.id} source={source} busy={workspace.busy === `source-${source.id}`} onRemove={workspace.removeSource} onRetry={workspace.retrySource} onPaste={pasteInstead} />)
          : <div className="source-empty"><Search size={17} /><span>Paste three sources or load the sample set to begin.</span></div>}
      </div>
      <button className="button button-primary analyze-sources" disabled={workspace.busy === "research" || workspace.sources.length < 3} onClick={workspace.processResearch}>
        {workspace.busy === "research" ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
        {workspace.busy === "research" ? "Analyzing sources…" : "Analyze sources"}
        {workspace.busy !== "research" && <ArrowRight size={15} />}
      </button>
      {workspace.brief && <BriefPanel brief={workspace.brief} angleId={workspace.angleId} setAngle={workspace.setAngle} onCopy={workspace.copyBrief} onDraft={workspace.generateNewsletter} />}
    </section>
  );
}
