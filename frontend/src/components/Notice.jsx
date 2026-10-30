import { AlertCircle, CheckCircle2, X } from "lucide-react";

export default function Notice({ notice, onDismiss }) {
  if (!notice) return null;
  const Icon = notice.success ? CheckCircle2 : AlertCircle;
  return (
    <div className={`notice ${notice.success ? "success" : ""}`} role="status" aria-live="polite">
      <Icon size={16} />
      <span>{notice.message}</span>
      <button aria-label="Dismiss notification" onClick={onDismiss}><X size={15} /></button>
    </div>
  );
}
