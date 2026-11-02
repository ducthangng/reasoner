import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { CompareView } from "./components/CompareView";
import { InsightPanel } from "./components/InsightPanel";
import { LibraryGrid } from "./components/LibraryGrid";
import { ModelPicker, useAiSettings } from "./components/ModelPicker";
import { usePasswordPrompt } from "./components/PasswordDialog";
import { PdfViewer } from "./components/PdfViewer";
import { useRegenerateDialog } from "./components/RegenerateDialog";
import type { ComparisonSummary, PaperSummary } from "./types";

type View = "library" | "read" | "compare";
/** On narrow screens only one pane shows: the document/map ("main") or the notes/details ("side"). */
export type Pane = "main" | "side";

interface Route {
  view: View;
  id: string | null;
}

/** Reads "#/" (library), "#/paper/<id>" or "#/compare/<id>", so links and the back button work. */
function readHash(): Route {
  const m = /^#\/(paper|compare)(?:\/([\w-]+))?/.exec(window.location.hash);
  if (!m) return { view: "library", id: null };
  if (m[1] === "paper") return m[2] ? { view: "read", id: m[2] } : { view: "library", id: null };
  return { view: "compare", id: m[2] ?? null };
}

function hashFor({ view, id }: Route): string {
  if (view === "library") return "#/";
  return `#/${view === "read" ? "paper" : "compare"}${id ? `/${id}` : ""}`;
}

export default function App() {
  const [route, setRoute] = useState<Route>(readHash);
  const { view } = route;
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pane, setPane] = useState<Pane>("main");
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonSummary[]>([]);
  const selectedPaperId = view === "read" ? route.id : null;
  const selectedComparisonId = view === "compare" ? route.id : null;
  const [jump, setJump] = useState<{ page: number; nonce: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const aiChoice = useAiSettings();
  const { ai } = aiChoice;
  const passwordPrompt = usePasswordPrompt();
  const askPassword = passwordPrompt.ask;
  const regenerateDialog = useRegenerateDialog(ai);

  /** Navigates and records a browser history entry (or replaces the current one). */
  const go = useCallback((next: Route, replace = false) => {
    const hash = hashFor(next);
    if (window.location.hash !== hash) {
      if (replace) history.replaceState(null, "", hash);
      else history.pushState(null, "", hash);
    }
    setRoute(next);
    setLibraryOpen(false);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(readHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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

  const openPaper = (id: string) => {
    setPane("main");
    go({ view: "read", id });
  };
  // Picking a map replaces the history entry, so auto-selecting the first map doesn't add one.
  const selectComparison = useCallback((id: string | null) => go({ view: "compare", id }, true), [go]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const pdfs = Array.from(files).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );
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
          // Open a single upload straight away; several stay visible in the library.
          if (pdfs.length === 1) go({ view: "read", id: paper.id });
          else go({ view: "library", id: null });
        } catch (err) {
          setUploadError(pdfs.length > 1 ? `${file.name}: ${errorText(err)}` : errorText(err));
          // A wrong password would fail for every file, so stop here.
          if (err instanceof ApiError && err.status === 401) return;
        }
      }
    },
    [ai, askPassword, go],
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

  /** Re-runs the analysis with the current model/mode and optional extra instructions. */
  const regeneratePaper = async (paper: PaperSummary) => {
    const title = paper.status === "error" ? "Try the analysis again" : "Regenerate analysis";
    const request = await regenerateDialog.ask(title, paper.instructions ?? "");
    if (!request) return;
    setUploadError(null);
    try {
      await api.reanalyze(paper.id, ai, request.password, request.instructions);
    } catch (err) {
      setUploadError(errorText(err));
    }
    await refresh();
  };

  const deletePaper = async (id: string) => {
    if (!confirm("Delete this paper and its analysis?")) return;
    await api.deletePaper(id);
    if (selectedPaperId === id) go({ view: "library", id: null });
    await refresh();
  };

  const openConceptInPaper = (paperId: string, page?: number) => {
    openPaper(paperId);
    if (page) setJump({ page, nonce: Date.now() });
  };

  return (
    <div className="app">
      <header className="topbar">
        {view === "compare" && (
          <button className="library-toggle" onClick={() => setLibraryOpen((o) => !o)} aria-label="Toggle maps">
            ☰ <span>Maps</span>
          </button>
        )}
        <div className="brand">
          <span className="brand-mark">◆</span> Reasoner
        </div>
        <nav className="tabs">
          <button className={view !== "compare" ? "active" : ""} onClick={() => go({ view: "library", id: null })}>
            Library
          </button>
          <button
            className={view === "compare" ? "active" : ""}
            onClick={() => go({ view: "compare", id: selectedComparisonId })}
          >
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

      {view !== "library" && (
        <div className="pane-switch" role="tablist">
          <button className={pane === "side" ? "active" : ""} onClick={() => setPane("side")}>
            {view === "read" ? "Notes" : "Details"}
          </button>
          <button className={pane === "main" ? "active" : ""} onClick={() => setPane("main")}>
            {view === "read" ? "PDF" : "Map"}
          </button>
        </div>
      )}

      {view === "library" && (
        <LibraryGrid
          papers={papers}
          onOpen={openPaper}
          onDelete={deletePaper}
          onRetry={(id) => {
            const paper = papers.find((p) => p.id === id);
            if (paper) void regeneratePaper(paper);
          }}
          onUpload={() => fileInput.current?.click()}
        />
      )}

      {view === "read" && (
        <main className={`read-layout pane-${pane}`}>
          <aside className="insight-pane">
            {selectedPaper ? (
              <InsightPanel
                key={selectedPaper.id}
                paper={selectedPaper}
                onJumpToPage={(page) => {
                  setPane("main");
                  setJump({ page, nonce: Date.now() });
                }}
                onRegenerate={() => regeneratePaper(selectedPaper)}
                onBack={() => go({ view: "library", id: null })}
                ai={ai}
              />
            ) : (
              <div className="insight-state">
                <p className="muted">{papers.length ? "This paper no longer exists." : "Loading…"}</p>
                <button className="link" onClick={() => go({ view: "library", id: null })}>
                  ← Back to the library
                </button>
              </div>
            )}
          </aside>
          <section className="pdf-pane">
            {selectedPaper && <PdfViewer key={selectedPaper.id} url={api.pdfUrl(selectedPaper.id)} jump={jump} />}
          </section>
        </main>
      )}

      {view === "compare" && (
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
      {regenerateDialog.dialog}

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
