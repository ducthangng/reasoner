import { useEffect, useState } from "react";
import { api } from "../api";
import type { AiSettings, PaperDetail, PaperSummary } from "../types";
import { AskTab } from "./AskTab";
import { ConceptsTab } from "./ConceptsTab";
import { Markdown } from "./Markdown";
import { aiLabel } from "./ModelPicker";

type Tab = "overview" | "concepts" | "practice" | "ask";

interface Props {
  paper: PaperSummary;
  onJumpToPage: (page: number) => void;
  onRetry: () => void;
  /** Currently selected model and effort, used for retries and new chat messages. */
  ai: AiSettings;
}

export function InsightPanel({ paper, onJumpToPage, onRetry, ai }: Props) {
  const current = aiLabel(ai.model, ai.effort);
  const used = aiLabel(paper.model, paper.effort);
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (paper.status !== "ready") return;
    let cancelled = false;
    api.getPaper(paper.id).then((d) => !cancelled && setDetail(d));
    return () => {
      cancelled = true;
    };
  }, [paper.id, paper.status]);

  if (paper.status === "processing") {
    return (
      <div className="insight-state">
        <div className="spinner" />
        <h3>Reading the paper…</h3>
        <p className="muted">
          The model is reading every page, identifying the key concepts and writing explanations. This usually takes
          a few minutes for a full paper.
        </p>
      </div>
    );
  }
  if (paper.status === "error") {
    return (
      <div className="insight-state">
        <h3>Analysis failed</h3>
        <p className="error-text">{paper.error}</p>
        <button className="primary" onClick={onRetry}>
          Retry with {current}
        </button>
      </div>
    );
  }
  const a = detail?.analysis;
  if (!a) return <div className="insight-state muted">Loading…</div>;

  return (
    <div className="insight">
      <div className="insight-header">
        <h2 className="paper-title">{a.title}</h2>
        <div className="muted small">
          {[a.authors.slice(0, 4).join(", ") + (a.authors.length > 4 ? " et al." : ""), a.venue, a.year]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="chip-row tight">
          {a.field && <span className="chip subtle">{a.field}</span>}
          <span className="chip subtle" title="Model that wrote this analysis">
            {used}
          </span>
          {current !== used && (
            <button
              className="link small"
              onClick={() => confirm(`Re-run the analysis with ${current}? This replaces the current one.`) && onRetry()}
            >
              Re-run with {current}
            </button>
          )}
        </div>
      </div>
      <div className="subtabs">
        {(
          [
            ["overview", "Overview"],
            ["concepts", `Concepts (${a.concepts.length})`],
            ["practice", "Practice"],
            ["ask", "Ask"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="insight-body">
        {tab === "overview" && (
          <div className="overview">
            <div className="tldr">{a.tldr}</div>
            <Section title="Summary">
              <Markdown>{a.summary}</Markdown>
            </Section>
            <Section title="The problem">
              <Markdown>{a.problem}</Markdown>
            </Section>
            <Section title="Key contributions">
              <ul>{a.key_contributions.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </Section>
            <Section title="How they did it">
              <Markdown>{a.methodology}</Markdown>
            </Section>
            <Section title="What they found">
              <Markdown>{a.results}</Markdown>
            </Section>
            <Section title="Limitations">
              <ul>{a.limitations.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </Section>
            <Section title="How to read this paper">
              <ol>{a.reading_plan.map((c, i) => <li key={i}>{c}</li>)}</ol>
            </Section>
          </div>
        )}
        {tab === "concepts" && <ConceptsTab concepts={a.concepts} onJumpToPage={onJumpToPage} />}
        {tab === "practice" && <PracticeTab questions={a.check_questions} />}
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

function PracticeTab({ questions }: { questions: { question: string; answer: string }[] }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  return (
    <div className="practice">
      <p className="muted small">Test yourself. Try answering before revealing.</p>
      {questions.map((q, i) => (
        <div key={i} className="card">
          <div className="question">
            <span className="q-num">{i + 1}</span> {q.question}
          </div>
          {revealed.has(i) ? (
            <div className="answer">
              <Markdown>{q.answer}</Markdown>
            </div>
          ) : (
            <button className="link" onClick={() => setRevealed((s) => new Set(s).add(i))}>
              Reveal answer
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
