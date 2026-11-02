import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Must be set in the same module that renders react-pdf components.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props {
  url: string;
  jump: { page: number; nonce: number } | null;
}

const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];

export function PdfViewer({ url, jump }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(800);
  const [zoomIdx, setZoomIdx] = useState(3);
  const [currentPage, setCurrentPage] = useState(1);
  const [aspect, setAspect] = useState(1.294); // height / width, measured from page 1
  const [rendered, setRendered] = useState<Set<number>>(() => new Set([1, 2]));
  const scroller = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Fit page width to the pane.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.min(entry.contentRect.width - 48, 1000)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!jump || jump.page < 1 || jump.page > numPages) return;
    setRendered((prev) => new Set([...prev, jump.page]));
    pageRefs.current[jump.page - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jump, numPages]);

  // Track which page is in view, and render pages only once they come near the viewport.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !numPages) return;
    const pages = pageRefs.current.slice(0, numPages).filter((el): el is HTMLDivElement => !!el);
    const current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCurrentPage(Number((e.target as HTMLElement).dataset.page));
        }
      },
      { root, threshold: 0.4 },
    );
    const nearby = new IntersectionObserver(
      (entries) => {
        const add = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.page));
        if (add.length) setRendered((prev) => (add.every((n) => prev.has(n)) ? prev : new Set([...prev, ...add])));
      },
      { root, rootMargin: "1500px 0px" },
    );
    pages.forEach((el) => {
      current.observe(el);
      nearby.observe(el);
    });
    return () => {
      current.disconnect();
      nearby.disconnect();
    };
  }, [numPages]);

  const pageWidth = Math.max(200, width * ZOOMS[zoomIdx]);

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <span className="muted small">
          {numPages ? `Page ${currentPage} / ${numPages}` : "Loading…"}
        </span>
        <a className="link small" href={url} target="_blank" rel="noreferrer">
          Open PDF ↗
        </a>
        <div className="zoom">
          <button className="icon-btn" disabled={zoomIdx === 0} onClick={() => setZoomIdx((z) => z - 1)}>
            −
          </button>
          <span className="small">{Math.round(ZOOMS[zoomIdx] * 100)}%</span>
          <button className="icon-btn" disabled={zoomIdx === ZOOMS.length - 1} onClick={() => setZoomIdx((z) => z + 1)}>
            +
          </button>
        </div>
      </div>
      <div className="pdf-scroll" ref={scroller}>
        <Document
          file={url}
          onLoadSuccess={async (pdf) => {
            setNumPages(pdf.numPages);
            const first = await pdf.getPage(1);
            const vp = first.getViewport({ scale: 1 });
            setAspect(vp.height / vp.width);
          }}
          loading={<div className="muted pad">Loading PDF…</div>}
          error={<div className="error-text pad">Could not load this PDF.</div>}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={i}
              className="pdf-page"
              data-page={i + 1}
              style={{ minHeight: pageWidth * aspect }}
              ref={(el) => {
                pageRefs.current[i] = el;
              }}
            >
              {rendered.has(i + 1) ? (
                <Page pageNumber={i + 1} width={pageWidth} />
              ) : (
                <div className="pdf-placeholder" style={{ width: pageWidth, height: pageWidth * aspect }} />
              )}
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
