import type {
  ChatMessage,
  ComparisonDetail,
  ComparisonSummary,
  ModelList,
  PaperDetail,
  PaperSummary,
} from "./types";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  listModels: () => request<ModelList>("/api/models"),
  listPapers: () => request<PaperSummary[]>("/api/papers"),
  getPaper: (id: string) => request<PaperDetail>(`/api/papers/${id}`),
  pdfUrl: (id: string) => `${API_URL}/api/papers/${id}/pdf`,
  uploadPaper: (file: File, model: string) => {
    const form = new FormData();
    form.append("model", model);
    form.append("file", file);
    return request<PaperSummary>("/api/papers", { method: "POST", body: form });
  },
  reanalyze: (id: string, model: string) => request<PaperSummary>(`/api/papers/${id}/reanalyze`, json({ model })),
  deletePaper: (id: string) => request<void>(`/api/papers/${id}`, { method: "DELETE" }),

  getChat: (id: string) => request<ChatMessage[]>(`/api/papers/${id}/chat`),
  clearChat: (id: string) => request<void>(`/api/papers/${id}/chat`, { method: "DELETE" }),
  /** Streams an answer; calls onDelta for each text chunk. Resolves when the answer is complete. */
  async ask(id: string, question: string, model: string, onDelta: (text: string) => void): Promise<void> {
    const res = await fetch(`${API_URL}/api/papers/${id}/chat`, json({ question, model }));
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Request failed (${res.status})`);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        if (!event.startsWith("data: ")) continue;
        const data = JSON.parse(event.slice(6));
        if (data.error) throw new Error(data.error);
        if (data.delta) onDelta(data.delta);
      }
    }
  },

  listComparisons: () => request<ComparisonSummary[]>("/api/comparisons"),
  getComparison: (id: string) => request<ComparisonDetail>(`/api/comparisons/${id}`),
  createComparison: (paperIds: string[], model: string) =>
    request<ComparisonSummary>("/api/comparisons", json({ paperIds, model })),
  retryComparison: (id: string, model: string) =>
    request<ComparisonSummary>(`/api/comparisons/${id}/retry`, json({ model })),
  deleteComparison: (id: string) => request<void>(`/api/comparisons/${id}`, { method: "DELETE" }),
};
