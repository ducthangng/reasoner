import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { AiSettings, ChatMessage } from "../types";
import { Markdown } from "./Markdown";
import { aiLabel } from "./ModelPicker";

const SUGGESTIONS = [
  "Explain the main idea like I'm a first-year student.",
  "What background do I need before reading the methods section?",
  "Walk me through the key equation step by step.",
  "What would a skeptical reviewer criticize?",
];

export function AskTab({ paperId, ai }: { paperId: string; ai: AiSettings }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getChat(paperId).then(setMessages).catch(() => undefined);
  }, [paperId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = async (question: string) => {
    if (!question.trim() || pending) return;
    setInput("");
    setError(null);
    setPending(true);
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "" }]);
    try {
      await api.ask(paperId, question, ai, (delta) =>
        setMessages((m) => {
          const last = m[m.length - 1];
          return [...m.slice(0, -1), { ...last, content: last.content + delta }];
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((m) => m.slice(0, -2));
      setInput(question);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="ask">
      <div className="ask-messages">
        {messages.length === 0 && (
          <div className="suggestions">
            <p className="muted small">Ask anything about this paper. Answers cite pages. Using {aiLabel(ai.model, ai.effort)}.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="suggestion" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "assistant" ? (
              m.content ? <Markdown>{m.content}</Markdown> : <span className="typing">Thinking…</span>
            ) : (
              m.content
            )}
          </div>
        ))}
        {error && <div className="error-text small">{error}</div>}
        <div ref={bottom} />
      </div>
      <form
        className="ask-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          placeholder="Ask about this paper…"
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <div className="ask-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="link small"
              disabled={pending}
              onClick={async () => {
                await api.clearChat(paperId);
                setMessages([]);
              }}
            >
              Clear
            </button>
          )}
          <button className="primary" disabled={pending || !input.trim()}>
            {pending ? "…" : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}
