import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { api } from "../api";
import type { PaperSummary } from "../types";
import { StatusDot } from "./StatusDot";

// Must be set in the same module that renders react-pdf components.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props {
  papers: PaperSummary[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onUpload: () => void;
}

/** Google Drive-style grid of papers with a preview of each first page. */
export function LibraryGrid({ papers, onOpen, onDelete, onRetry, onUpload }: Props) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? papers.filter((p) => (p.title ?? p.filename).toLowerCase().includes(q) || p.filename.toLowerCase().includes(q))
    : papers;

  return (
    <main className="library-home">
      <div className="library-home-head">
        <h2>Library</h2>
        <span className="muted small">
          {papers.length} {papers.length === 1 ? "paper" : "papers"}
        </span>
        {papers.length > 0 && (
          <input
            className="search library-search"
            placeholder="Search papers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>
      <div className="library-grid">
        <button className="paper-card upload-card" onClick={onUpload}>
          <div className="upload-card-inner">
            <div className="empty-drop-icon">⇪</div>
            <strong>Add a paper</strong>
            <span className="muted small">Click or drop a PDF anywhere</span>
          </div>
        </button>
        {shown.map((p) => (
          <div
            key={p.id}
            className="paper-card"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(p.id)}
            onKeyDown={(e) => e.key === "Enter" && onOpen(p.id)}
          >
            <Thumbnail paperId={p.id} />
            <div className="paper-card-meta">
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
                      Failed. Retry
                    </button>
                  )}
                </div>
              </div>
              <button
                className="icon-btn card-delete"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(p.id);
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      {q && shown.length === 0 && <p className="muted pad">No papers match "{query}".</p>}
    </main>
  );
}

/** Renders page 1 of the PDF, but only once the card scrolls into view. */
function Thumbnail({ paperId }: { paperId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(200);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <div className="paper-thumb" ref={ref}>
      {visible && (
        <Document file={api.pdfUrl(paperId)} loading={null} error={<div className="thumb-fallback">PDF</div>}>
          <Page
            pageNumber={1}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={null}
          />
        </Document>
      )}
    </div>
  );
}
