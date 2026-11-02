import type { PaperSummary } from "../types";
import { StatusDot } from "./StatusDot";

interface Props {
  papers: PaperSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

export function Library({ papers, selectedId, onSelect, onDelete, onRetry }: Props) {
  return (
    <nav className="library">
      <div className="pane-heading">Library</div>
      {papers.length === 0 && <p className="muted small pad">No papers yet. Drop a PDF anywhere.</p>}
      <ul>
        {papers.map((p) => (
          <li key={p.id} className={p.id === selectedId ? "selected" : ""} onClick={() => onSelect(p.id)}>
            <StatusDot status={p.status} />
            <div className="library-item">
              <div className="library-title" title={p.title ?? p.filename}>
                {p.title ?? p.filename}
              </div>
              <div className="muted small">
                {p.status === "processing" && "Analyzing…"}
                {p.status === "ready" && new Date(p.created_at).toLocaleDateString()}
                {p.status === "error" && (
                  <button
                    className="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(p.id);
                    }}
                  >
                    Failed — retry
                  </button>
                )}
              </div>
            </div>
            <button
              className="icon-btn"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(p.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
