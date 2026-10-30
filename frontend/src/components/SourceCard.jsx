import { ExternalLink, RotateCw, Trash2 } from "lucide-react";

export default function SourceCard({ source, busy, onRemove, onRetry, onPaste }) {
  const status = source.status === "error" ? "Needs attention" : ["processed", "extracted"].includes(source.status) ? "Ready" : "Waiting";
  return (
    <article className="source-row">
      <span className="source-link-icon"><ExternalLink size={14} /></span>
      <div className="source-info">
        <strong>{source.title || "Untitled source"}</strong>
        <small>{source.user_provided ? "Pasted text · not independently verified" : source.url || "Source text supplied"}</small>
        {source.error && <p className="source-error">{source.error}</p>}
      </div>
      <span className={`source-state ${source.status === "error" ? "error" : source.status === "processed" || source.status === "extracted" ? "ready" : ""}`}>{status}</span>
      <div className="source-actions">
        {source.status === "error" && <>
          <button className="icon-action" disabled={busy} title="Retry source" aria-label="Retry source" onClick={() => onRetry(source.id)}><RotateCw size={14} /></button>
          <button className="text-action" onClick={() => onPaste(source)}>Paste instead</button>
        </>}
        <button className="icon-action" title="Remove source" aria-label={`Remove ${source.title}`} onClick={() => onRemove(source.id)}><Trash2 size={14} /></button>
      </div>
    </article>
  );
}
