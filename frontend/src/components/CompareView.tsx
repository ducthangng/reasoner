import { useEffect, useState } from "react";
import { api } from "../api";
import type { AiSettings, ComparisonDetail, ComparisonSummary, PaperSummary } from "../types";
import { Markdown } from "./Markdown";
import { MindMap, type MapSelection } from "./MindMap";
import { aiLabel } from "./ModelPicker";
import { RELATION_STYLE } from "./relations";
import { StatusDot } from "./StatusDot";

interface Props {
  papers: PaperSummary[];
  comparisons: ComparisonSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChanged: () => Promise<void>;
  onOpenConcept: (paperId: string, page?: number) => void;
  ai: AiSettings;
  /** Responsive-layout classes from App (pane switch, library drawer). */
  layoutClass: string;
  onCloseLibrary: () => void;
  /** Sets the details panel width (--panel) and the drag handle that changes it. */
  layoutStyle: React.CSSProperties;
  panelResizer: React.ReactNode;
}

export function CompareView({
  papers,
  comparisons,
  selectedId,
  onSelect,
  onChanged,
  onOpenConcept,
  ai,
  layoutClass,
  onCloseLibrary,
  layoutStyle,
  panelResizer,
}: Props) {
  const ready = papers.filter((p) => p.status === "ready");
  const [picked, setPicked] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ComparisonDetail | null>(null);
  const [selection, setSelection] = useState<MapSelection>(null);

  const selected = comparisons.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && comparisons.length) onSelect(comparisons[0].id);
  }, [comparisons, selectedId, onSelect]);

  useEffect(() => {
    setSelection(null);
    if (!selected || selected.status !== "ready") {
      setDetail(null);
      return;
    }
    let cancelled = false;
    api.getComparison(selected.id).then((d) => !cancelled && setDetail(d));
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.status]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const c = await api.createComparison(picked, ai);
      setPicked([]);
      await onChanged();
      onSelect(c.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start comparison");
    } finally {
      setCreating(false);
    }
  };

  const result = detail?.result;

  return (
    <main className={`compare-layout ${layoutClass}`} style={layoutStyle}>
      <div className="drawer-backdrop" onClick={onCloseLibrary} />
      <nav className="library">
        <div className="pane-heading">New map</div>
        <p className="muted small pad">Pick 2–4 analyzed papers. Order sets the columns.</p>
        <ul className="pick-list">
          {ready.map((p) => {
            const idx = picked.indexOf(p.id);
            return (
              <li key={p.id} className={idx >= 0 ? "selected" : ""} onClick={() => toggle(p.id)}>
                <span className={`pick-box ${idx >= 0 ? "on" : ""}`}>{idx >= 0 ? String.fromCharCode(65 + idx) : ""}</span>
                <div className="library-title">{p.title ?? p.filename}</div>
              </li>
            );
          })}
          {ready.length < 2 && <li className="muted small">Analyze at least two papers first.</li>}
        </ul>
        <div className="pad">
          <button className="primary block" disabled={picked.length < 2 || creating} onClick={create}>
            {creating ? "Starting…" : "Connect the dots"}
          </button>
          <p className="muted small">Uses {aiLabel(ai.model, ai.effort)}</p>
          {error && <p className="error-text small">{error}</p>}
        </div>

        <div className="pane-heading">Maps</div>
        <ul>
          {comparisons.map((c) => (
            <li key={c.id} className={c.id === selectedId ? "selected" : ""} onClick={() => onSelect(c.id)}>
              <StatusDot status={c.status} />
              <div className="library-item">
                <div className="library-title">{(c.paper_titles ?? []).join(" ↔ ") || "Comparison"}</div>
                <div className="muted small">
                  {c.status === "processing" ? "Researching connections…" : new Date(c.created_at).toLocaleDateString()}
                  {" · "}
                  {aiLabel(c.model, c.effort)}
                </div>
              </div>
              <button
                className="icon-btn"
                title="Delete"
                onClick={async (e) => {
                  e.stopPropagation();
                  await api.deleteComparison(c.id);
                  if (selectedId === c.id) onSelect(null);
                  await onChanged();
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <aside className="insight-pane">
        {panelResizer}
        {result && (
          <div className="insight">
            <div className="insight-body">
              {selection ? (
                <SelectionDetail
                  result={result}
                  selection={selection}
                  onSelect={setSelection}
                  onOpenConcept={onOpenConcept}
                />
              ) : (
                <div className="overview">
                  <h4>How these papers relate</h4>
                  <Markdown>{result.overview}</Markdown>
                  <h4>Shared themes</h4>
                  <ul>{result.shared_themes.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  <h4>Key differences</h4>
                  <ul>{result.key_differences.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  <h4>Suggested learning path</h4>
                  <ol>{result.learning_path.map((t, i) => <li key={i}>{t}</li>)}</ol>
                  <p className="muted small">Tip: click a concept or a line in the map to see how things connect.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
      <section className="map-pane">
        {!selected && (
          <div className="insight-state">
            <h3>Connect concepts across papers</h3>
            <p className="muted">
              Pick papers on the left. The model reads them together and draws a map linking concepts that are the
              same, related, build on each other, or contrast.
            </p>
          </div>
        )}
        {selected?.status === "processing" && (
          <div className="insight-state">
            <div className="spinner" />
            <h3>Researching connections…</h3>
            <p className="muted">Reading the papers side by side. This can take a few minutes.</p>
          </div>
        )}
        {selected?.status === "error" && (
          <div className="insight-state">
            <h3>Comparison failed</h3>
            <p className="error-text">{selected.error}</p>
            <button
              className="primary"
              onClick={async () => {
                await api.retryComparison(selected.id, ai);
                await onChanged();
              }}
            >
              Retry with {aiLabel(ai.model, ai.effort)}
            </button>
          </div>
        )}
        {result && <MindMap result={result} selection={selection} onSelect={setSelection} />}
      </section>

    </main>
  );
}

function SelectionDetail({
  result,
  selection,
  onSelect,
  onOpenConcept,
}: {
  result: NonNullable<ComparisonDetail["result"]>;
  selection: NonNullable<MapSelection>;
  onSelect: (s: MapSelection) => void;
  onOpenConcept: (paperId: string) => void;
}) {
  const paperById = new Map(result.papers.map((p) => [p.id, p]));
  const conceptName = (ref: { paperId: string; concept: number }) => {
    const p = paperById.get(ref.paperId);
    return { label: p?.label ?? "?", term: p?.concepts[ref.concept]?.term ?? "?" };
  };

  const links =
    selection.kind === "link"
      ? [result.links[selection.index]]
      : result.links.filter(
          (l) =>
            (l.from.paperId === selection.paperId && l.from.concept === selection.concept) ||
            (l.to.paperId === selection.paperId && l.to.concept === selection.concept),
        );

  const node =
    selection.kind === "node" ? paperById.get(selection.paperId)?.concepts[selection.concept] : undefined;

  return (
    <div className="overview">
      <button className="link small" onClick={() => onSelect(null)}>
        ← Back to overview
      </button>
      {node && selection.kind === "node" && (
        <>
          <h3 className="sel-title">
            <span className="paper-tag">{paperById.get(selection.paperId)?.label}</span> {node.term}
          </h3>
          <p>{node.short_definition}</p>
          <button className="link small" onClick={() => onOpenConcept(selection.paperId)}>
            Open this paper →
          </button>
          <h4>{links.length ? `Connections (${links.length})` : "No connections found"}</h4>
        </>
      )}
      {links.map((l, i) => {
        const a = conceptName(l.from);
        const b = conceptName(l.to);
        const style = RELATION_STYLE[l.relation];
        return (
          <div key={i} className="card link-card" style={{ borderLeftColor: style.color }}>
            <div className="link-card-head">
              <span>
                <span className="paper-tag">{a.label}</span> {a.term}
              </span>
              <span className="relation" style={{ color: style.color }}>
                {style.verb}
              </span>
              <span>
                <span className="paper-tag">{b.label}</span> {b.term}
              </span>
            </div>
            <p>{l.explanation}</p>
          </div>
        );
      })}
    </div>
  );
}
