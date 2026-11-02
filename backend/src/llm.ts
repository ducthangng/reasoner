import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";
import {
  ComparisonModelSchema,
  PaperAnalysisSchema,
  type ComparisonModelOutput,
  type PaperAnalysis,
} from "./schemas.js";

const client = new OpenAI();

export class LLMError extends Error {}

// ---------- Models ----------

/** Models offered in the UI: current text models with reasoning that accept PDFs, newest first. */
export const RESEARCH_MODELS = [
  { id: "gpt-5.6-sol", note: "" },
  { id: "gpt-5.6-luna", note: "" },
  { id: "gpt-5.5-pro", note: "slow, expensive" },
  { id: "gpt-5.5-2026-04-23", note: "" },
  { id: "gpt-5.2-pro", note: "slow, expensive" },
  { id: "gpt-5.4-2026-03-05", note: "" },
  { id: "gpt-5.4-mini", note: "fast, cheap" },
  { id: "gpt-5.1", note: "" },
] as const;

export const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5-2026-04-23";
const ALLOWED = new Set<string>([...RESEARCH_MODELS.map((m) => m.id), DEFAULT_MODEL]);

let availableCache: { at: number; ids: Set<string> } | null = null;

/** The research models this API key can use. Falls back to the full list if OpenAI can't be asked. */
export async function listModels(): Promise<{ id: string; note: string }[]> {
  const all: { id: string; note: string }[] = RESEARCH_MODELS.map((m) => ({ id: m.id, note: m.note }));
  if (!RESEARCH_MODELS.some((m) => m.id === DEFAULT_MODEL)) all.unshift({ id: DEFAULT_MODEL, note: "" });
  if (!availableCache || Date.now() - availableCache.at > 10 * 60_000) {
    const ids = new Set<string>();
    for await (const m of client.models.list()) ids.add(m.id);
    availableCache = { at: Date.now(), ids };
  }
  const usable = all.filter((m) => availableCache!.ids.has(m.id));
  return usable.length ? usable : all;
}

/** Only models from the research list (or the configured default) are accepted. */
export function resolveModel(requested: unknown): string {
  return typeof requested === "string" && ALLOWED.has(requested) ? requested : DEFAULT_MODEL;
}

export const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** A valid effort level, or null to leave it to the model's default. */
export function resolveEffort(requested: unknown): Effort | null {
  return EFFORTS.includes(requested as Effort) ? (requested as Effort) : null;
}

export interface AiSettings {
  model: string;
  /** null = don't send a reasoning effort; the model uses its default. */
  effort: Effort | null;
}

function modelParams({ model, effort }: AiSettings) {
  const reasoning: { effort: ReasoningEffort } | undefined = effort ? { effort } : undefined;
  return reasoning ? { model, reasoning } : { model };
}

// ---------- Files ----------

export async function uploadPdf(filename: string, pdf: Buffer): Promise<string> {
  const file = await client.files.create({
    file: await toFile(pdf, filename, { type: "application/pdf" }),
    purpose: "user_data",
  });
  return file.id;
}

export async function deleteUploadedFile(fileId: string): Promise<void> {
  await client.files.delete(fileId).catch(() => undefined);
}

/** Returns true if the uploaded file still exists on OpenAI's side. */
export async function fileExists(fileId: string): Promise<boolean> {
  try {
    await client.files.retrieve(fileId);
    return true;
  } catch (err) {
    if (err instanceof OpenAI.NotFoundError) return false;
    throw err;
  }
}

// ---------- Response checks ----------

interface CheckableResponse {
  status?: string | null;
  incomplete_details?: { reason?: string } | null;
  output: Array<{ type: string; content?: Array<{ type: string; refusal?: string }> }>;
}

function assertCompleted(response: CheckableResponse): void {
  for (const item of response.output) {
    if (item.type !== "message") continue;
    const refusal = item.content?.find((c) => c.type === "refusal");
    if (refusal) throw new LLMError(`The model declined this request: ${refusal.refusal ?? ""}`.trim());
  }
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason;
    throw new LLMError(
      reason === "max_output_tokens"
        ? "The model ran out of output tokens before finishing. Try a model with a larger output limit."
        : `The model stopped early (${reason ?? "incomplete"}).`,
    );
  }
}

// ---------- Prompts ----------

const MENTOR = `You are an expert research mentor who helps newcomers understand scientific papers.
You read the full paper carefully (text, equations, figures and tables) and explain it in clear, plain language
without dumbing down the substance. You are precise about what the paper actually claims, and you never invent
results, numbers or citations that are not in the paper.`;

function pdfInput(fileId: string) {
  return { type: "input_file" as const, file_id: fileId };
}

export async function analyzePaper(ai: AiSettings, fileId: string): Promise<PaperAnalysis> {
  const stream = client.responses.stream({
    ...modelParams(ai),
    instructions: MENTOR,
    text: { format: zodTextFormat(PaperAnalysisSchema, "paper_analysis") },
    input: [
      {
        role: "user",
        content: [
          pdfInput(fileId),
          {
            type: "input_text",
            text: `Analyze this paper for a motivated learner who is new to the field.

Identify the concepts a newcomer must understand to follow this paper: the background ideas, methods,
mathematical tools, metrics and domain terms it relies on. You decide how many. A short, focused paper may need only
a handful, while a dense paper that spans several fields may need many more. Include every concept that genuinely
helps a learner understand the paper, and don't pad the list with trivia.

Rank the concepts by how much a learner needs them to understand this paper, most essential first. Give each one
a relevance tier:
- essential: you cannot follow the paper's core argument without it
- important: needed to understand a major section, method or result
- helpful: deepens understanding of details, experiments or context
- peripheral: mentioned in passing or useful background only
The list must be ordered so that every essential concept comes before every important one, and so on, with the
most relevant concept first within each tier.

For each concept, teach it from scratch, explain its specific role in this paper and why it has its rank, and list
the PDF pages (1-indexed, as the PDF viewer counts them) where it appears. Prerequisites should reference other
concepts in your list by their exact term when possible.

Also write the summary, reading plan and self-check questions described in the output schema.`,
          },
        ],
      },
    ],
  });
  const response = await stream.finalResponse();
  assertCompleted(response);
  if (!response.output_parsed) throw new LLMError("The model returned an analysis that did not match the schema.");
  return response.output_parsed;
}

export interface ComparisonInput {
  label: string;
  fileId: string;
  analysis: PaperAnalysis;
}

export async function comparePapers(ai: AiSettings, papers: ComparisonInput[]): Promise<ComparisonModelOutput> {
  const conceptIndex = papers
    .map((p) => {
      const concepts = p.analysis.concepts
        .map((c, i) => `  ${p.label}.c${i + 1} [${c.relevance}]: ${c.term} — ${c.short_definition}`)
        .join("\n");
      return `Paper ${p.label}: "${p.analysis.title}"\nTL;DR: ${p.analysis.tldr}\nConcepts:\n${concepts}`;
    })
    .join("\n\n");

  const stream = client.responses.stream({
    ...modelParams(ai),
    instructions: MENTOR,
    text: { format: zodTextFormat(ComparisonModelSchema, "paper_comparison") },
    input: [
      {
        role: "user",
        content: [
          ...papers.flatMap((p) => [
            { type: "input_text" as const, text: `Paper ${p.label}: ${p.analysis.title}` },
            pdfInput(p.fileId),
          ]),
          {
            type: "input_text",
            text: `The full text of each paper is attached above. Each paper has already been broken down into key concepts:

${conceptIndex}

Research how these papers connect, reading the full texts to verify each connection rather than matching names.
Find links between concepts in DIFFERENT papers: the same idea under different names, ideas one paper builds on
from another, competing approaches, prerequisites, and applications in new settings. Be thorough — a learner
should be able to see every meaningful connection — but do not invent links that the papers do not support.
Use the exact concept keys above (e.g. "A.c3") in "from" and "to".`,
          },
        ],
      },
    ],
  });
  const response = await stream.finalResponse();
  assertCompleted(response);
  if (!response.output_parsed) throw new LLMError("The model returned a comparison that did not match the schema.");
  return response.output_parsed;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function chatAboutPaper(
  ai: AiSettings,
  fileId: string,
  history: ChatTurn[],
  question: string,
  onText: (delta: string) => void,
): Promise<string> {
  // The PDF leads the first turn so the shared prefix stays stable and OpenAI's automatic prompt caching applies.
  const turns: ChatTurn[] = [...history, { role: "user", content: question }];
  const input: ResponseInputItem[] = turns.map((turn, i) =>
    i === 0
      ? { role: "user", content: [pdfInput(fileId), { type: "input_text", text: turn.content }] }
      : { role: turn.role, content: turn.content },
  );

  const stream = client.responses.stream({
    ...modelParams(ai),
    instructions: `${MENTOR}
You are tutoring a learner who is reading the attached paper. Answer their questions grounded in the paper,
cite page numbers like (p. 4) when you refer to specific content, and explain background knowledge when they
need it. Keep answers focused; use markdown for structure when it helps.`,
    input,
  });
  stream.on("response.output_text.delta", (event) => onText(event.delta));
  const response = await stream.finalResponse();
  assertCompleted(response);
  return response.output_text;
}

export function describeApiError(err: unknown): string | null {
  if (err instanceof OpenAI.AuthenticationError) return "The server's OpenAI API key is missing or invalid.";
  if (err instanceof OpenAI.BadRequestError)
    return `OpenAI rejected the request: ${err.message}. Not every model supports every reasoning level, so try another level or "Model default".`;
  if (err instanceof OpenAI.RateLimitError) return "OpenAI rate limit or quota reached. Retry in a minute.";
  if (err instanceof OpenAI.NotFoundError) return `OpenAI: ${err.message} (does your key have access to this model?)`;
  if (err instanceof OpenAI.APIError) return `OpenAI API error (${err.status}): ${err.message}`;
  return null;
}
