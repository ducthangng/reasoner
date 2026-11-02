import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { CompareView } from "./components/CompareView";
import { InsightPanel } from "./components/InsightPanel";
import { Library } from "./components/Library";
import { ModelPicker, useAiSettings } from "./components/ModelPicker";
import { usePasswordPrompt } from "./components/PasswordDialog";
import { PdfViewer } from "./components/PdfViewer";
import type { ComparisonSummary, PaperSummary } from "./types";

type View = "read" | "compare";
/** On narrow screens only one pane shows: the document/map ("main") or the notes/details ("side"). */
export type Pane = "main" | "side";

/** Reads "#/paper/<id>" or "#/compare/<id>" so a link opens a specific paper or map. */
function readHash(): { view: View; id: string | null } {
  const m = /^#\/(paper|compare)(?:\/([\w-]+))?/.exec(window.location.hash);
  if (!m) return { view: "read", id: null };
  return { view: m[1] === "compare" ? "compare" : "read", id: m[2] ?? null };
}

export default function App() {
  const initial = readHash();
  const [view, setView] = useState<View>(initial.view);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pane, setPane] = useState<Pane>("main");
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonSummary[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(initial.view === "read" ? initial.id : null);
  const [selectedComparisonId, setSelectedComparisonId] = useState<string | null>(
    initial.view === "compare" ? initial.id : null,
  );
  const [jump, setJump] = useState<{ page: number; nonce: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const aiChoice = useAiSettings();
  const { ai } = aiChoice;
  const passwordPrompt = usePasswordPrompt();
  const askPassword = passwordPrompt.ask;

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

  // Keep the URL in sync with what's open.
  useEffect(() => {
    const id = view === "read" ? selectedPaperId : selectedComparisonId;
    const hash = `#/${view === "read" ? "paper" : "compare"}${id ? `/${id}` : ""}`;
    if (window.location.hash !== hash) history.replaceState(null, "", hash);
  }, [view, selectedPaperId, selectedComparisonId]);

  const selectPaper = (id: string) => {
    setSelectedPaperId(id);
    setLibraryOpen(false);
    setPane("main");
  };
  const selectComparison = (id: string | null) => {
    setSelectedComparisonId(id);
    setLibraryOpen(false);
  };

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const pdfs = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      if (!pdfs.length) {
        setUploadError("Drop a PDF file.");
        return;
      }
      setUploadError(null);
      const names = pdfs.length === 1 ? `"${pdfs[0].name}"` : `${pdfs.length} papers`;
      const password = await askPassword(`Enter the password to analyze ${names}.`);
      if (password === null) return;
      for (const file of pdfs) {
        try {
          const paper = await api.uploadPaper(file, ai, password);
          setPapers((prev) => [paper, ...prev]);
          setSelectedPaperId(paper.id);
          setView("read");
        } catch (err) {
          setUploadError(pdfs.length > 1 ? `${file.name}: ${errorText(err)}` : errorText(err));
          // A wrong password would fail for every file, so stop here.
          if (err instanceof ApiError && err.status === 401) return;
        }
      }
    },
    [ai, askPassword],
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
    const password = await askPassword("Enter the password to analyze this paper again.");
    if (password === null) return;
    setUploadError(null);
    try {
      await api.reanalyze(id, ai, password);
    } catch (err) {
      setUploadError(errorText(err));
    }
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
    setPane("main");
    if (page) setJump({ page, nonce: Date.now() });
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="library-toggle" onClick={() => setLibraryOpen((o) => !o)} aria-label="Toggle library">
          ☰ <span>{view === "read" ? "Library" : "Maps"}</span>
        </button>
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
          <ModelPicker {...aiChoice} />
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

      {loadError && <div className="banner">{loadError}</div>}

      <div className="pane-switch" role="tablist">
        <button className={pane === "main" ? "active" : ""} onClick={() => setPane("main")}>
          {view === "read" ? "PDF" : "Map"}
        </button>
        <button className={pane === "side" ? "active" : ""} onClick={() => setPane("side")}>
          {view === "read" ? "Notes" : "Details"}
        </button>
      </div>

      {view === "read" ? (
        <main className={`read-layout pane-${pane} ${libraryOpen ? "library-open" : ""}`}>
          <div className="drawer-backdrop" onClick={() => setLibraryOpen(false)} />
          <Library
            papers={papers}
            selectedId={selectedPaperId}
            onSelect={selectPaper}
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
                ai={ai}
              />
            )}
          </aside>
        </main>
      ) : (
        <CompareView
          papers={papers}
          comparisons={comparisons}
          selectedId={selectedComparisonId}
          onSelect={selectComparison}
          onChanged={refresh}
          onOpenConcept={openConceptInPaper}
          ai={ai}
          layoutClass={`pane-${pane} ${libraryOpen ? "library-open" : ""}`}
          onCloseLibrary={() => setLibraryOpen(false)}
        />
      )}

      {passwordPrompt.dialog}

      {dragging && (
        <div className="drop-overlay">
          <div>Drop PDF to analyze</div>
        </div>
      )}
    </div>
  );
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
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
