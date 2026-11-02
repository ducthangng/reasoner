import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComparisonResult, Relation } from "../types";
import { RELATION_STYLE } from "./relations";

export type MapSelection =
  | { kind: "node"; paperId: string; concept: number }
  | { kind: "link"; index: number }
  | null;

interface Props {
  result: ComparisonResult;
  selection: MapSelection;
  onSelect: (s: MapSelection) => void;
}

interface DrawnPath {
  index: number;
  d: string;
  skipsColumn: boolean;
}

const nodeKey = (paperId: string, concept: number) => `${paperId}:${concept}`;

export function MindMap({ result, selection, onSelect }: Props) {
  const allRelations = useMemo(() => [...new Set(result.links.map((l) => l.relation))], [result]);
  const [hidden, setHidden] = useState<Set<Relation>>(new Set());
  const [onlyLinked, setOnlyLinked] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [paths, setPaths] = useState<DrawnPath[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const content = useRef<HTMLDivElement>(null);
  const nodeEls = useRef(new Map<string, HTMLButtonElement>());

  const columnOf = useMemo(() => new Map(result.papers.map((p, i) => [p.id, i])), [result]);
  const visibleLinks = useMemo(
    () => result.links.map((l, index) => ({ ...l, index })).filter((l) => !hidden.has(l.relation)),
    [result, hidden],
  );

  const linkedNodes = useMemo(() => {
    const s = new Set<string>();
    for (const l of visibleLinks) {
      s.add(nodeKey(l.from.paperId, l.from.concept));
      s.add(nodeKey(l.to.paperId, l.to.concept));
    }
    return s;
  }, [visibleLinks]);

  // The node whose connections are emphasized: hover wins, then a selected node.
  const focusNode = hovered ?? (selection?.kind === "node" ? nodeKey(selection.paperId, selection.concept) : null);
  const focusLinks = useMemo(() => {
    if (selection?.kind === "link" && !hovered) return new Set([selection.index]);
    if (!focusNode) return null;
    return new Set(
      visibleLinks
        .filter(
          (l) =>
            nodeKey(l.from.paperId, l.from.concept) === focusNode || nodeKey(l.to.paperId, l.to.concept) === focusNode,
        )
        .map((l) => l.index),
    );
  }, [focusNode, selection, hovered, visibleLinks]);
  const focusNodes = useMemo(() => {
    if (!focusLinks) return null;
    const s = new Set<string>(focusNode ? [focusNode] : []);
    for (const i of focusLinks) {
      const l = result.links[i];
      s.add(nodeKey(l.from.paperId, l.from.concept));
      s.add(nodeKey(l.to.paperId, l.to.concept));
    }
    return s;
  }, [focusLinks, focusNode, result]);

  const layout = useCallback(() => {
    const root = content.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    setSize({ w: root.scrollWidth, h: root.scrollHeight });
    const drawn: DrawnPath[] = [];
    for (const l of visibleLinks) {
      // Always draw left-to-right, from the paper in the earlier column.
      let [a, b] = [l.from, l.to];
      if ((columnOf.get(a.paperId) ?? 0) > (columnOf.get(b.paperId) ?? 0)) [a, b] = [b, a];
      const ea = nodeEls.current.get(nodeKey(a.paperId, a.concept));
      const eb = nodeEls.current.get(nodeKey(b.paperId, b.concept));
      if (!ea || !eb) continue;
      const ra = ea.getBoundingClientRect();
      const rb = eb.getBoundingClientRect();
      const x1 = ra.right - base.left;
      const y1 = ra.top + ra.height / 2 - base.top;
      const x2 = rb.left - base.left;
      const y2 = rb.top + rb.height / 2 - base.top;
      const dx = Math.max(40, (x2 - x1) * 0.45);
      drawn.push({
        index: l.index,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        skipsColumn: Math.abs((columnOf.get(a.paperId) ?? 0) - (columnOf.get(b.paperId) ?? 0)) > 1,
      });
    }
    setPaths(drawn);
  }, [visibleLinks, columnOf]);

  useLayoutEffect(() => {
    layout();
    const root = content.current;
    if (!root) return;
    const ro = new ResizeObserver(layout);
    ro.observe(root);
    return () => ro.disconnect();
  }, [layout, onlyLinked]);

  const toggleRelation = (r: Relation) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });

  return (
    <div className="mindmap">
      <div className="map-toolbar">
        {allRelations.map((r) => (
          <button
            key={r}
            className={`chip legend ${hidden.has(r) ? "" : "on"}`}
            style={{ "--rel": RELATION_STYLE[r].color } as React.CSSProperties}
            onClick={() => toggleRelation(r)}
          >
            <span className="swatch" /> {RELATION_STYLE[r].label}
          </button>
        ))}
        <label className="toggle small">
          <input type="checkbox" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} />
          Only connected concepts
        </label>
        <span className="muted small">{visibleLinks.length} connections</span>
      </div>

      <div className="map-scroll">
        <div
          className="map-content"
          ref={content}
          style={{ gridTemplateColumns: `repeat(${result.papers.length}, minmax(160px, 260px))` }}
        >
          <svg className="map-links" width={size.w} height={size.h}>
            {paths.map((p) => {
              const link = result.links[p.index];
              const style = RELATION_STYLE[link.relation];
              const active = focusLinks?.has(p.index);
              const dim = focusLinks && !active;
              return (
                <g
                  key={p.index}
                  className="map-link"
                  onClick={() => onSelect({ kind: "link", index: p.index })}
                  opacity={dim ? 0.08 : p.skipsColumn && !active ? 0.45 : 0.9}
                >
                  <path d={p.d} stroke="transparent" strokeWidth={12} fill="none" />
                  <path
                    d={p.d}
                    stroke={style.color}
                    strokeWidth={active ? 1.5 + link.strength : 0.75 + link.strength * 0.5}
                    strokeDasharray={style.dash ?? (p.skipsColumn ? "2 4" : undefined)}
                    fill="none"
                  >
                    <title>{`${style.label}: ${link.explanation}`}</title>
                  </path>
                </g>
              );
            })}
          </svg>

          {result.papers.map((paper) => (
            <div key={paper.id} className="map-column">
              <div className="map-column-head">
                <span className="paper-tag">{paper.label}</span>
                <span className="map-column-title" title={paper.title}>
                  {paper.title}
                </span>
              </div>
              {paper.concepts.map((c, i) => {
                const key = nodeKey(paper.id, i);
                if (onlyLinked && !linkedNodes.has(key)) return null;
                const isSelected = selection?.kind === "node" && selection.paperId === paper.id && selection.concept === i;
                const dim = focusNodes && !focusNodes.has(key);
                return (
                  <button
                    key={key}
                    ref={(el) => {
                      if (el) nodeEls.current.set(key, el);
                      else nodeEls.current.delete(key);
                    }}
                    className={`map-node cat-${c.category} ${isSelected ? "selected" : ""} ${dim ? "dim" : ""} ${
                      linkedNodes.has(key) ? "" : "unlinked"
                    }`}
                    title={c.short_definition}
                    onMouseEnter={() => setHovered(key)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onSelect(isSelected ? null : { kind: "node", paperId: paper.id, concept: i })}
                  >
                    <span className="rank">{i + 1}</span>
                    <span className="node-term">{c.term}</span>
                    {c.relevance && (
                      <span className={`tier-pip tier-${c.relevance}`} title={`${c.relevance} to its paper`} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
