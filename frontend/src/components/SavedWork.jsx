import { Clock3, FolderOpen, Trash2 } from "lucide-react";

export default function SavedWork({ workspace }) {
  return (
    <section className="panel saved-panel">
      <div className="section-title">
        <div><span className="step-number"><FolderOpen size={15} /></span><div><h2>Saved work</h2><p>Open a previous research and writing session.</p></div></div>
        <button className="button button-outline small" onClick={workspace.loadProjects}>Refresh</button>
      </div>
      {workspace.projects.length ? <div className="saved-list">
        {workspace.projects.map((project) => <article className="saved-row" key={project.id}>
          <span className="saved-file"><FolderOpen size={17} /></span>
          <div><strong>{project.title}</strong><small><Clock3 size={12} /> Updated {new Date(project.updated_at).toLocaleString()}</small></div>
          <button className="button button-outline small" disabled={workspace.busy === "open"} onClick={() => workspace.openProject(project.id)}>Open</button>
          <button className="icon-action" aria-label={`Delete ${project.title}`} onClick={() => workspace.deleteProject(project.id, project.title)}><Trash2 size={14} /></button>
        </article>)}
      </div> : <div className="empty-library"><FolderOpen size={25} /><strong>No saved work yet</strong><span>Save a research session to find it here later.</span></div>}
    </section>
  );
}
