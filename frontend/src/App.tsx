import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { CompareView } from "./components/CompareView";
import { InsightPanel } from "./components/InsightPanel";
import { Library } from "./components/Library";
import { ModelPicker, useModelChoice } from "./components/ModelPicker";
import { PdfViewer } from "./components/PdfViewer";
import type { ComparisonSummary, PaperSummary } from "./types";

type View = "read" | "compare";

export default function App() {
  const [view, setView] = useState<View>("read");
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonSummary[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedComparisonId, setSelectedComparisonId] = useState<string | null>(null);
  const [jump, setJump] = useState<{ page: number; nonce: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const modelChoice = useModelChoice();
  const { model } = modelChoice;

  const refresh = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.listPapers(), api.listComparisons()]);
      setPapers(p);
      setComparisons(c);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not reach the server");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while anything is still being analyzed.
  const busy = papers.some((p) => p.status === "processing") || comparisons.some((c) => c.status === "processing");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [busy, refresh]);

  useEffect(() => {
    if (!selectedPaperId && papers.length) setSelectedPaperId(papers[0].id);
  }, [papers, selectedPaperId]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const pdfs = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      if (!pdfs.length) {
        setUploadError("Drop a PDF file.");
        return;
      }
      setUploadError(null);
      for (const file of pdfs) {
        try {
          const paper = await api.uploadPaper(file, model);
          setPapers((prev) => [paper, ...prev]);
          setSelectedPaperId(paper.id);
          setView("read");
        } catch (err) {
          setUploadError(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
        }
      }
    },
    [model],
  );

  // Drop a PDF anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) void uploadFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [uploadFiles]);

  const selectedPaper = papers.find((p) => p.id === selectedPaperId) ?? null;

  const retryPaper = async (id: string) => {
    await api.reanalyze(id, model);
    await refresh();
  };

  const deletePaper = async (id: string) => {
    if (!confirm("Delete this paper and its analysis?")) return;
    await api.deletePaper(id);
    if (selectedPaperId === id) setSelectedPaperId(null);
    await refresh();
  };

  const openConceptInPaper = (paperId: string, page?: number) => {
    setSelectedPaperId(paperId);
    setView("read");
    if (page) setJump({ page, nonce: Date.now() });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span> Reasoner
        </div>
        <nav className="tabs">
          <button className={view === "read" ? "active" : ""} onClick={() => setView("read")}>
            Read
          </button>
          <button className={view === "compare" ? "active" : ""} onClick={() => setView("compare")}>
            Compare
          </button>
        </nav>
        <div className="topbar-right">
          {uploadError && <span className="error-text">{uploadError}</span>}
          <ModelPicker {...modelChoice} />
          <button className="primary" onClick={() => fileInput.current?.click()}>
            + Add paper
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      {loadError && <div className="banner">Can't reach the API: {loadError}</div>}

      {view === "read" ? (
        <main className="read-layout">
          <Library
            papers={papers}
            selectedId={selectedPaperId}
            onSelect={setSelectedPaperId}
            onDelete={deletePaper}
            onRetry={retryPaper}
          />
          <section className="pdf-pane">
            {selectedPaper ? (
              <PdfViewer key={selectedPaper.id} url={api.pdfUrl(selectedPaper.id)} jump={jump} />
            ) : (
              <EmptyDrop onBrowse={() => fileInput.current?.click()} />
            )}
          </section>
          <aside className="insight-pane">
            {selectedPaper && (
              <InsightPanel
                key={selectedPaper.id}
                paper={selectedPaper}
                onJumpToPage={(page) => setJump({ page, nonce: Date.now() })}
                onRetry={() => retryPaper(selectedPaper.id)}
                model={model}
              />
            )}
          </aside>
        </main>
      ) : (
        <CompareView
          papers={papers}
          comparisons={comparisons}
          selectedId={selectedComparisonId}
          onSelect={setSelectedComparisonId}
          onChanged={refresh}
          onOpenConcept={openConceptInPaper}
          model={model}
        />
      )}

      {dragging && (
        <div className="drop-overlay">
          <div>Drop PDF to analyze</div>
        </div>
      )}
    </div>
  );
}

function EmptyDrop({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="empty-drop" onClick={onBrowse}>
      <div className="empty-drop-icon">⇪</div>
      <h2>Drop a scientific paper here</h2>
      <p>
        PDF only. Reasoner reads the whole paper and pulls out the key concepts you need to learn, a plain-language
        summary, a reading plan, and self-check questions.
      </p>
      <button className="primary">Browse files</button>
    </div>
  );
}
