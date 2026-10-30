import { useState } from "react";
import { Check, Copy, FileText, Lightbulb, ShieldCheck } from "lucide-react";

const tabs = [
  ["summary", "Executive summary"],
  ["takeaways", "Key takeaways"],
  ["evidence", "Evidence"],
  ["angles", "Stories & angles"],
];

export default function BriefPanel({ brief, angleId, setAngle, onCopy, onDraft }) {
  const [tab, setTab] = useState("summary");
  if (!brief) return null;
  return (
    <section className="brief-panel" id="research-brief">
      <div className="section-title compact">
        <div><span className="step-number">2</span><div><h2>Research brief</h2><p>{brief.sources.length} sources · evidence-linked synthesis</p></div></div>
        <button className="button button-outline small" onClick={onCopy}><Copy size={14} /> Copy brief</button>
      </div>
      <div className="brief-tabs" role="tablist" aria-label="Research brief sections">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="brief-content">
        {tab === "summary" && <>
          <p className="brief-lede">{brief.executive_summary}</p>
          <div className="takeaway-grid">
            <article><span className="mini-icon purple"><Lightbulb size={15} /></span><strong>Why it matters</strong><p>{brief.analysis?.[0]?.text || "Assess the reported material against the intended audience."}</p></article>
            <article><span className="mini-icon green"><ShieldCheck size={15} /></span><strong>What remains unknown</strong><p>{brief.uncertainties?.[0]?.text || "The source excerpts have not been independently verified."}</p></article>
          </div>
        </>}
        {tab === "takeaways" && <div className="takeaway-list">
          {[...(brief.who_should_care || []).map((text) => ({ text })), ...(brief.analysis || []), ...(brief.uncertainties || []), ...(brief.opportunities || []).map((text) => ({ text }))].map((item, index) => <p key={`${index}-${item.text}`}><Check size={14} />{item.text}</p>)}
        </div>}
        {tab === "evidence" && <div className="evidence-list">
          {(brief.facts || []).map((claim, index) => <article key={`${index}-${claim.text}`}><p>{claim.text}</p><small>“{claim.evidence}”</small><span className="citation">{claim.verification.replaceAll("_", " ")} · {claim.source_ids.join(", ")}</span></article>)}
        </div>}
        {tab === "angles" && <div className="angle-list">
          {(brief.angles || []).map((angle) => <label className={`angle-option ${angleId === angle.id ? "chosen" : ""}`} key={angle.id}><input type="radio" name="angle" value={angle.id} checked={angleId === angle.id} onChange={() => setAngle(angle.id)} /><span><strong>{angle.title}</strong><small>{angle.rationale}</small></span></label>)}
        </div>}
      </div>
      <div className="brief-footer">
        <span><FileText size={14} /> Excerpts are source-reported, not independently verified.</span>
        <button className="button button-primary small" onClick={onDraft}>Create editorial draft <span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}
