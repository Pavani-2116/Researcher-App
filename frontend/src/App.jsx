import { useEffect } from "react";
import { ArrowDown, Bell, ChevronDown, FileText, Plus, Save } from "lucide-react";
import { useWorkspace } from "./hooks/useWorkspace.js";
import Sidebar from "./components/Sidebar.jsx";
import Notice from "./components/Notice.jsx";
import ResearchPanel from "./components/ResearchPanel.jsx";
import WritingPanel from "./components/WritingPanel.jsx";
import EditorialOutput from "./components/EditorialOutput.jsx";
import SavedWork from "./components/SavedWork.jsx";

export default function App() {
  const workspace = useWorkspace();
  useEffect(() => {
    if (workspace.view === "history") workspace.loadProjects();
  }, [workspace.view, workspace.loadProjects]);

  return (
    <div className="app-shell">
      <Sidebar active={workspace.view} onChange={workspace.setView} mode={workspace.mode} />
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>WORKSPACE</span><i>/</i><strong>{workspace.view === "history" ? "History" : workspace.view === "documents" ? "Documents" : "Research & writing"}</strong><ChevronDown size={13} /></div>
          <div className="top-actions"><span className="project-name">{workspace.projectTitle}</span><button className="button button-outline small" disabled={workspace.busy === "save"} onClick={() => workspace.saveProject()}><Save size={14} /> Save work</button><button className="top-icon" aria-label="Notifications" onClick={() => workspace.inform("You are up to date.", true)}><Bell size={16} /></button><span className="avatar">S</span></div>
        </header>
        <div className="content-wrap">
          <Notice notice={workspace.notice} onDismiss={workspace.dismissNotice} />
          {workspace.view === "history" ? <SavedWork workspace={workspace} /> : workspace.view === "documents" ? <EditorialOutput workspace={workspace} /> : <>
            <div className="welcome-row">
              <div><span className="eyebrow">YOUR EDITORIAL DESK <i>·</i> ISSUE 01</span><h1>Research carefully.<br /><em>Write with purpose.</em></h1><p>One focused workspace for source-backed research, clear writing, and the story in between.</p></div>
              <a className="quick-link" href="#documents"><span><FileText size={16} /></span>See editorial output<ArrowDown size={14} /></a>
            </div>
            <div className="workspace-grid">
              <ResearchPanel workspace={workspace} />
              <WritingPanel workspace={workspace} />
            </div>
            <EditorialOutput workspace={workspace} />
          </>}
          <footer className="footer"><span>Source &amp; Story <i>·</i> Thoughtful work starts with good sources.</span><button onClick={() => workspace.setView("workspace")}><Plus size={12} /> New workspace</button></footer>
        </div>
      </main>
    </div>
  );
}
