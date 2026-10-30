import { BookOpen, Clock3, FileText, LayoutDashboard, PenLine, Sparkles } from "lucide-react";

const links = [
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "history", label: "History", icon: Clock3 },
];

export default function Sidebar({ active, onChange, mode }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); onChange("workspace"); }}>
        <span className="brand-mark"><BookOpen size={19} /></span>
        <span className="brand-copy"><strong>Source <i>&amp;</i> Story</strong><small>EDITORIAL WORKSPACE</small></span>
      </a>
      <div className="side-label">YOUR DESK</div>
      <nav className="side-nav" aria-label="Main navigation">
        {links.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`side-link ${active === id ? "active" : ""}`} onClick={() => onChange(id)}>
            <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="side-tip">
        <span className="tip-icon"><Sparkles size={15} /></span>
        <strong>Evidence first</strong>
        <p>Every claim stays connected to its source. You stay in control of the final story.</p>
      </div>
      <div className="mode-card">
        <span className={`mode-indicator ${mode.label === "Offline" ? "offline" : ""}`} />
        <span><strong>{mode.label}</strong><small>{mode.detail}</small></span>
      </div>
      <div className="sidebar-foot">SOURCE &amp; STORY <span>·</span> v1.0</div>
    </aside>
  );
}
