import { ArrowRight, CheckCircle2, FileText, Quote, Sparkles } from "lucide-react";

const exampleBefore = "In order to evaluate whether the new workflow is useful, teams should consider measuring how much time is saved and whether there are errors that could affect the final result.";
const exampleAfter = "Measure time saved and errors that could change the result. Compare both against the current workflow.";

export default function EditorialOutput({ workspace }) {
  const text = workspace.newsletter?.text || "A source can describe a product update. The editorial question is what evidence would show that the change matters. Compare a supervised trial with a documented baseline before drawing conclusions.";
  const headline = workspace.newsletter?.headline || "A better story begins with a better question";
  const generated = Boolean(workspace.newsletter);
  return (
    <section className="output-section" id="documents">
      <div className="output-heading">
        <div><span className="eyebrow"><Sparkles size={13} /> EDITORIAL WORKBENCH</span><h2>{generated ? "Your editorial draft" : "Sample editorial output"}</h2><p>{generated ? "Generated from the current research brief. Check every claim and citation." : "A short, clearly illustrative example of source-aware editorial writing."}</p></div>
        <span className={`sample-badge ${generated ? "generated" : ""}`}>{generated ? "CURRENT BRIEF" : "FICTIONAL EXAMPLE"}</span>
      </div>
      <div className="output-grid">
        <article className="output-card story-card">
          <div className="output-card-top"><span><FileText size={14} /> NEWSLETTER PREVIEW</span>{generated && <span className="draft-status"><CheckCircle2 size={12} /> Draft ready</span>}</div>
          <h3>{headline}</h3>
          <p className="story-copy">{generated ? text.split(/\n{2,}/).filter(Boolean).slice(1, 4).join("\n\n") : text}</p>
          {generated && <button className="inline-link" onClick={() => workspace.exportNewsletter()}>Export draft <ArrowRight size={13} /></button>}
          {!generated && <div className="sample-citation">Example copy only · not live reporting or verified facts</div>}
        </article>
        <article className="output-card before-card">
          <div className="output-card-top"><span>BEFORE <i>·</i> ORIGINAL COPY</span><span className="tag warm">Needs focus</span></div>
          <p>{generated ? workspace.originalDraft || text : exampleBefore}</p>
          <span className="quality-note">Long sentence · filler phrase</span>
        </article>
        <div className="change-arrow"><ArrowRight size={17} /></div>
        <article className="output-card after-card">
          <div className="output-card-top"><span>AFTER <i>·</i> EDITOR-REVIEWED</span><span className="tag cool">Clearer</span></div>
          <p>{generated && workspace.draft !== workspace.originalDraft ? workspace.draft : generated ? text : exampleAfter}</p>
          <span className="quality-note"><CheckCircle2 size={12} /> Shorter, specific, keeps the meaning</span>
        </article>
        <aside className="improvements-card">
          <div className="output-card-top"><span>EDITOR CHECKLIST</span></div>
          {["Source claims stay attributed", "Analysis is clearly labeled", "Uncertainty is preserved", "The editor makes the final call"].map((item) => <p key={item}><CheckCircle2 size={14} />{item}</p>)}
          <div className="editor-quote"><Quote size={15} /><span>Clarity is not about making every sentence short. It is about making every sentence earn its place.</span></div>
        </aside>
      </div>
    </section>
  );
}
