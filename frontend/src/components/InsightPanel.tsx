import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { AiSettings, Method, PaperAnalysis, PaperDetail, PaperSummary } from "../types";
import { AskTab } from "./AskTab";
import { ConceptsTab } from "./ConceptsTab";
import { Eli5 } from "./Eli5";
import { Markdown } from "./Markdown";
import { aiLabel } from "./ModelPicker";

type Tab = "overview" | "research" | "concepts" | "methods" | "ask";

interface Props {
  paper: PaperSummary;
  onJumpToPage: (page: number) => void;
  /** Opens the regenerate dialog (extra instructions + password). */
  onRegenerate: () => void;
  onBack: () => void;
  /** Currently selected model and effort, used for new chat messages. */
  ai: AiSettings;
}

export function InsightPanel({ paper, onJumpToPage, onRegenerate, onBack, ai }: Props) {
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  // Cross-links: a method listed in a concept opens in the Methods tab, and vice versa.
  const [focusMethod, setFocusMethod] = useState<{ name: string; nonce: number } | null>(null);
  const [focusConcept, setFocusConcept] = useState<number | null>(null);

  useEffect(() => {
    if (paper.status !== "ready") return;
    let cancelled = false;
    api.getPaper(paper.id).then((d) => !cancelled && setDetail(d));
    return () => {
      cancelled = true;
    };
  }, [paper.id, paper.status]);

  const back = (
    <button className="link small back-link" onClick={onBack}>
      ← Library
    </button>
  );

  if (paper.status === "processing") {
    return (
      <div className="insight-state">
        {back}
        <div className="spinner" />
        <h3>Reading the paper…</h3>
        <p className="muted">
          The model is reading every page and working out the methods, research questions, evaluation, gaps and key
          concepts. A full paper usually takes a few minutes.
        </p>
      </div>
    );
  }
  if (paper.status === "error") {
    return (
      <div className="insight-state">
        {back}
        <h3>Analysis failed</h3>
        <p className="error-text">{paper.error}</p>
        <button className="primary" onClick={onRegenerate}>
          Try again…
        </button>
      </div>
    );
  }
  const a = detail?.analysis;
  if (!a) return <div className="insight-state muted">Loading…</div>;

  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["research", "Research"],
    ["concepts", `Concepts (${a.concepts.length})`],
    ["methods", a.methods ? `Methods (${a.methods.length})` : "Methods"],
    ["ask", "Ask"],
  ];
  const openMethod = (name: string) => {
    setFocusMethod({ name, nonce: Date.now() });
    setTab("methods");
  };
  const openConcept = (index: number) => {
    setFocusConcept(index);
    setTab("concepts");
  };

  return (
    <div className="insight">
      <div className="insight-header">
        <div className="insight-actions">
          {back}
          <button
            className="secondary small"
            onClick={onRegenerate}
            title="Analyze again, optionally with your own instructions"
          >
            ↻ Regenerate
          </button>
        </div>
        <h2 className="paper-title">{a.title}</h2>
        <div className="muted small">
          {[a.authors.slice(0, 4).join(", ") + (a.authors.length > 4 ? " et al." : ""), a.venue, a.year]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="chip-row tight">
          {a.field && <span className="chip subtle">{a.field}</span>}
          <span className="chip subtle" title="Model and mode that wrote this analysis">
            {aiLabel(paper.model, paper.effort)}
          </span>
          {paper.instructions && (
            <span className="chip subtle" title={paper.instructions}>
              ✎ Custom instructions
            </span>
          )}
        </div>
      </div>
      <div className="subtabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="insight-body">
        {tab === "overview" && <OverviewTab a={a} />}
        {tab === "research" && <ResearchTab a={a} onRegenerate={onRegenerate} />}
        {tab === "concepts" && (
          <ConceptsTab
            concepts={a.concepts}
            onJumpToPage={onJumpToPage}
            detailedMethods={new Set((a.methods ?? []).map((m) => m.name.toLowerCase()))}
            onOpenMethod={openMethod}
            focus={focusConcept}
          />
        )}
        {tab === "methods" && (
          <MethodsTab
            a={a}
            onJumpToPage={onJumpToPage}
            onRegenerate={onRegenerate}
            focus={focusMethod}
            onOpenConcept={openConcept}
          />
        )}
        {tab === "ask" && <AskTab paperId={paper.id} ai={ai} />}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return items.length ? (
    <ul>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  ) : (
    <p className="muted small">None reported.</p>
  );
}

function MissingSection({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <div className="insight-state">
      <p className="muted">This analysis was made before this section existed.</p>
      <button className="primary" onClick={onRegenerate}>
        Regenerate…
      </button>
    </div>
  );
}

function OverviewTab({ a }: { a: PaperAnalysis }) {
  return (
    <div className="overview">
      <div className="tldr">{a.tldr}</div>
      <Eli5>{a.eli5}</Eli5>
      <Section title="Summary">
        <Markdown>{a.summary}</Markdown>
      </Section>
      <Section title="The problem">
        <Markdown>{a.problem}</Markdown>
      </Section>
      <Section title="Key contributions">
        <List items={a.key_contributions} />
      </Section>
      <Section title="How they did it">
        <Markdown>{a.methodology}</Markdown>
      </Section>
      <Section title="What they found">
        <Markdown>{a.results}</Markdown>
      </Section>
      <Section title="Limitations">
        <List items={a.limitations} />
      </Section>
      <Section title="How to read this paper">
        <ol>
          {a.reading_plan.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

function ResearchTab({ a, onRegenerate }: { a: PaperAnalysis; onRegenerate: () => void }) {
  if (!a.research_questions && !a.gaps && !a.evaluation) return <MissingSection onRegenerate={onRegenerate} />;
  const addressed = (a.gaps ?? []).filter((g) => g.type === "addressed");
  const remaining = (a.gaps ?? []).filter((g) => g.type === "remaining");
  const ev = a.evaluation;

  return (
    <div className="overview">
      <Section title="Hypotheses & research questions">
        {(a.research_questions ?? []).map((q, i) => (
          <div key={i} className="card">
            <span className={`chip ${q.type === "hypothesis" ? "kind-proposed" : "kind-existing"}`}>
              {q.type === "hypothesis" ? "Hypothesis" : "Research question"}
            </span>
            <p className="statement">{q.statement}</p>
            <p className="small">
              <strong>What they found:</strong> {q.answer}
            </p>
            <Eli5>{q.eli5}</Eli5>
          </div>
        ))}
        {!a.research_questions?.length && <p className="muted small">None identified.</p>}
      </Section>

      <Section title="Gaps this paper fills">
        {addressed.map((g, i) => (
          <div key={i} className="card gap-card addressed">
            <p className="statement">{g.gap}</p>
            <Eli5>{g.eli5}</Eli5>
          </div>
        ))}
        {!addressed.length && <p className="muted small">None identified.</p>}
      </Section>

      <Section title="Gaps still open">
        {remaining.map((g, i) => (
          <div key={i} className="card gap-card remaining">
            <p className="statement">{g.gap}</p>
            <Eli5>{g.eli5}</Eli5>
          </div>
        ))}
        {!remaining.length && <p className="muted small">None identified.</p>}
      </Section>

      {ev && (
        <Section title="Evaluation">
          <Eli5>{ev.eli5}</Eli5>
          <h5>Setup</h5>
          <Markdown>{ev.setup}</Markdown>
          <h5>Data</h5>
          <List items={ev.datasets} />
          <h5>Metrics</h5>
          <List items={ev.metrics} />
          <h5>Compared against</h5>
          <List items={ev.baselines} />
          <h5>Key results</h5>
          <List items={ev.findings} />
          <h5>How convincing is it?</h5>
          <Markdown>{ev.validity}</Markdown>
        </Section>
      )}
    </div>
  );
}

const KIND_LABEL: Record<Method["kind"], string> = {
  proposed: "Proposed here",
  existing: "Builds on",
  baseline: "Baseline",
  dataset: "Dataset",
  tool: "Tool",
};
const KIND_ORDER: Method["kind"][] = ["proposed", "existing", "baseline", "dataset", "tool"];

function MethodsTab({
  a,
  onJumpToPage,
  onRegenerate,
  focus,
  onOpenConcept,
}: {
  a: PaperAnalysis;
  onJumpToPage: (page: number) => void;
  onRegenerate: () => void;
  focus: { name: string; nonce: number } | null;
  onOpenConcept: (index: number) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // Which concept group each method belongs to, by name.
  const conceptOf = useMemo(() => {
    const map = new Map<string, number>();
    a.concepts.forEach((c, i) =>
      c.methods?.forEach((m) => map.set(m.name.toLowerCase(), map.get(m.name.toLowerCase()) ?? i)),
    );
    return map;
  }, [a]);

  useEffect(() => {
    if (!focus || !a.methods) return;
    const m = a.methods.find((x) => x.name.toLowerCase() === focus.name.toLowerCase());
    if (!m) return;
    const key = `${m.kind}:${m.name}`;
    setOpen(key);
    requestAnimationFrame(() => document.getElementById(`method-${key}`)?.scrollIntoView({ block: "start" }));
  }, [focus, a]);

  if (!a.methods) return <MissingSection onRegenerate={onRegenerate} />;
  const methods = [...a.methods].sort((x, y) => KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind));

  return (
    <div className="concepts">
      {methods.map((m, n) => {
        const key = `${m.kind}:${m.name}`;
        const isOpen = open === key;
        return (
          <div key={key}>
            {(n === 0 || methods[n - 1].kind !== m.kind) && (
              <div className="tier-heading kind-heading">
                <span className="tier-name">{KIND_LABEL[m.kind]}</span>
              </div>
            )}
            <div id={`method-${key}`} className={`concept ${isOpen ? "open" : ""}`}>
              <button className="concept-head" onClick={() => setOpen(isOpen ? null : key)}>
                <span className="concept-term">{m.name}</span>
                <span className={`chip kind-${m.kind}`}>{KIND_LABEL[m.kind]}</span>
              </button>
              <div className="concept-def flush">{m.what_it_is}</div>
              {isOpen && (
                <div className="concept-body flush">
                  {conceptOf.has(m.name.toLowerCase()) && (
                    <div className="meta-row">
                      <span className="muted small">Part of</span>
                      <button
                        className="chip link-chip"
                        onClick={() => onOpenConcept(conceptOf.get(m.name.toLowerCase())!)}
                      >
                        {a.concepts[conceptOf.get(m.name.toLowerCase())!].term} →
                      </button>
                    </div>
                  )}
                  {m.pages.length > 0 && (
                    <div className="meta-row">
                      <span className="pages">
                        {m.pages.slice(0, 8).map((p) => (
                          <button key={p} className="page-btn" onClick={() => onJumpToPage(p)}>
                            p.{p}
                          </button>
                        ))}
                      </span>
                    </div>
                  )}
                  <Eli5>{m.eli5}</Eli5>
                  <h5>Used for</h5>
                  <Markdown>{m.used_for}</Markdown>
                  <h5>How it works</h5>
                  <Markdown>{m.how_it_works}</Markdown>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {methods.length === 0 && <p className="muted small">No specific methods identified.</p>}
    </div>
  );
}
