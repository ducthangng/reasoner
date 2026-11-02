import { useMemo, useRef, useState } from "react";
import type { Concept, ConceptCategory, Relevance } from "../types";
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

export const RELEVANCE_INFO: Record<Relevance, { label: string; hint: string }> = {
  essential: { label: "Essential", hint: "You can't follow the paper's core argument without these" },
  important: { label: "Important", hint: "Needed for a major section, method or result" },
  helpful: { label: "Helpful", hint: "Deepens understanding of details and context" },
  peripheral: { label: "Peripheral", hint: "Mentioned in passing, or background only" },
};
const TIERS = Object.keys(RELEVANCE_INFO) as Relevance[];

interface Props {
  concepts: Concept[];
  onJumpToPage: (page: number) => void;
}

export function ConceptsTab({ concepts, onJumpToPage }: Props) {
  const [open, setOpen] = useState<number | null>(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ConceptCategory | "all">("all");
  const [tier, setTier] = useState<Relevance | "all">("all");
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const indexByTerm = useMemo(() => new Map(concepts.map((c, i) => [c.term.toLowerCase(), i])), [concepts]);
  const categories = useMemo(() => [...new Set(concepts.map((c) => c.category))], [concepts]);
  const tierCounts = useMemo(() => {
    const counts = new Map<Relevance, number>();
    for (const c of concepts) counts.set(c.relevance, (counts.get(c.relevance) ?? 0) + 1);
    return counts;
  }, [concepts]);

  const q = query.trim().toLowerCase();
  const visible = concepts
    .map((c, i) => ({ c, i }))
    .filter(
      ({ c }) =>
        (category === "all" || c.category === category) &&
        (tier === "all" || c.relevance === tier) &&
        (!q || c.term.toLowerCase().includes(q) || c.short_definition.toLowerCase().includes(q)),
    );

  const goTo = (i: number) => {
    setQuery("");
    setCategory("all");
    setTier("all");
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
        <button className={`chip ${tier === "all" ? "on" : ""}`} onClick={() => setTier("all")}>
          All {concepts.length}
        </button>
        {TIERS.filter((t) => tierCounts.has(t)).map((t) => (
          <button
            key={t}
            className={`chip tier-${t} ${tier === t ? "on" : ""}`}
            title={RELEVANCE_INFO[t].hint}
            onClick={() => setTier(t)}
          >
            {RELEVANCE_INFO[t].label} {tierCounts.get(t)}
          </button>
        ))}
      </div>
      <div className="chip-row">
        <button className={`chip ${category === "all" ? "on" : ""}`} onClick={() => setCategory("all")}>
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`chip cat-${cat} ${category === cat ? "on" : ""}`}
            onClick={() => setCategory(cat)}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>
      {visible.map(({ c, i }, n) => (
        <div key={i}>
          {(n === 0 || visible[n - 1].c.relevance !== c.relevance) && (
            <div className={`tier-heading tier-${c.relevance}`}>
              <span className="tier-name">{RELEVANCE_INFO[c.relevance]?.label ?? c.relevance}</span>
              <span className="muted small">{RELEVANCE_INFO[c.relevance]?.hint}</span>
            </div>
          )}
          <div
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
                {c.relevance_reason && (
                  <>
                    <h5>Why it ranks #{i + 1}</h5>
                    <p className="small">{c.relevance_reason}</p>
                  </>
                )}
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
        </div>
      ))}
      {visible.length === 0 && <p className="muted small">No concepts match.</p>}
    </div>
  );
}
