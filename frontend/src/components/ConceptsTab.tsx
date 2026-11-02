import { useMemo, useRef, useState } from "react";
import type { Concept, ConceptCategory } from "../types";
import { Markdown } from "./Markdown";

export const CATEGORY_LABEL: Record<ConceptCategory, string> = {
  foundation: "Foundation",
  method: "Method",
  math: "Math",
  domain: "Domain",
  tool: "Tool",
  metric: "Metric",
  result: "Result",
};

interface Props {
  concepts: Concept[];
  onJumpToPage: (page: number) => void;
}

export function ConceptsTab({ concepts, onJumpToPage }: Props) {
  const [open, setOpen] = useState<number | null>(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ConceptCategory | "all">("all");
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const indexByTerm = useMemo(
    () => new Map(concepts.map((c, i) => [c.term.toLowerCase(), i])),
    [concepts],
  );
  const categories = useMemo(() => [...new Set(concepts.map((c) => c.category))], [concepts]);

  const q = query.trim().toLowerCase();
  const visible = concepts
    .map((c, i) => ({ c, i }))
    .filter(
      ({ c }) =>
        (category === "all" || c.category === category) &&
        (!q || c.term.toLowerCase().includes(q) || c.short_definition.toLowerCase().includes(q)),
    );

  const goTo = (i: number) => {
    setQuery("");
    setCategory("all");
    setOpen(i);
    requestAnimationFrame(() => itemRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  return (
    <div className="concepts">
      <input
        className="search"
        placeholder="Search concepts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chip-row">
        <button className={`chip ${category === "all" ? "on" : ""}`} onClick={() => setCategory("all")}>
          All
        </button>
        {categories.map((cat) => (
          <button key={cat} className={`chip cat-${cat} ${category === cat ? "on" : ""}`} onClick={() => setCategory(cat)}>
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>
      {visible.map(({ c, i }) => (
        <div
          key={i}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          className={`concept ${open === i ? "open" : ""}`}
        >
          <button className="concept-head" onClick={() => setOpen(open === i ? null : i)}>
            <span className="rank">{i + 1}</span>
            <span className="concept-term">{c.term}</span>
            <span className={`dot cat-${c.category}`} title={CATEGORY_LABEL[c.category]} />
          </button>
          <div className="concept-def">{c.short_definition}</div>
          {open === i && (
            <div className="concept-body">
              <div className="meta-row">
                <span className={`chip cat-${c.category}`}>{CATEGORY_LABEL[c.category]}</span>
                <span className="chip subtle">{c.difficulty}</span>
                {c.pages.length > 0 && (
                  <span className="pages">
                    {c.pages.slice(0, 8).map((p) => (
                      <button key={p} className="page-btn" onClick={() => onJumpToPage(p)}>
                        p.{p}
                      </button>
                    ))}
                  </span>
                )}
              </div>
              <Markdown>{c.explanation}</Markdown>
              {c.analogy && (
                <div className="callout">
                  <strong>Think of it like:</strong> {c.analogy}
                </div>
              )}
              <h5>In this paper</h5>
              <Markdown>{c.role_in_paper}</Markdown>
              {c.prerequisites.length > 0 && (
                <>
                  <h5>Learn first</h5>
                  <div className="chip-row">
                    {c.prerequisites.map((pre) => {
                      const idx = indexByTerm.get(pre.toLowerCase());
                      return idx !== undefined ? (
                        <button key={pre} className="chip link-chip" onClick={() => goTo(idx)}>
                          {pre} →
                        </button>
                      ) : (
                        <span key={pre} className="chip subtle">
                          {pre}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {visible.length === 0 && <p className="muted small">No concepts match.</p>}
    </div>
  );
}
