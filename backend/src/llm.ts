import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import {
  ComparisonModelSchema,
  PaperAnalysisSchema,
  type ComparisonModelOutput,
  type PaperAnalysis,
} from "./schemas.js";

const client = new OpenAI();
export const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";
const CONCEPT_COUNT = Number(process.env.CONCEPT_COUNT ?? 25);

export class LLMError extends Error {}

// ---------- Models ----------

export interface ModelInfo {
  id: string;
  created: number;
}

// Text models that can read PDFs. Excludes audio/image/embedding/etc. and dated snapshots to keep the list short.
const INCLUDE = /^(gpt-[4-9]|o\d|chatgpt-)/;
const EXCLUDE =
  /(audio|realtime|tts|transcribe|image|search|embedding|moderation|computer|instruct|codex|deep-research|\d{4}-\d{2}-\d{2}$)|^gpt-4(-|$)/;

let modelCache: { at: number; models: ModelInfo[] } | null = null;

export async function listModels(): Promise<ModelInfo[]> {
  if (modelCache && Date.now() - modelCache.at < 10 * 60_000) return modelCache.models;
  const models: ModelInfo[] = [];
  for await (const m of client.models.list()) {
    if (INCLUDE.test(m.id) && !EXCLUDE.test(m.id)) models.push({ id: m.id, created: m.created });
  }
  models.sort((a, b) => b.created - a.created);
  modelCache = { at: Date.now(), models };
  return models;
}

const MODEL_ID = /^[A-Za-z0-9._:-]{1,128}$/;
export function resolveModel(requested: unknown): string {
  return typeof requested === "string" && MODEL_ID.test(requested) ? requested : DEFAULT_MODEL;
}

/** Reasoning models (o-series, GPT-5 and later, except chat variants) accept a reasoning effort. */
function reasoningFor(model: string, effort: "medium" | "high") {
  return /^(o\d|gpt-([5-9]|\d\d))/.test(model) && !model.includes("chat") ? { reasoning: { effort } } : {};
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

export async function analyzePaper(model: string, fileId: string): Promise<PaperAnalysis> {
  const stream = client.responses.stream({
    model,
    ...reasoningFor(model, "high"),
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

Identify the ${CONCEPT_COUNT} most important concepts a newcomer must understand to follow this paper — the
background ideas, methods, mathematical tools, metrics and domain terms it relies on — ordered from most to least
important. Prefer concepts that unlock understanding of the paper over trivia. For each concept, teach it from
scratch, explain its specific role in this paper, and list the PDF pages (1-indexed, as the PDF viewer counts
them) where it appears. Prerequisites should reference other concepts in your list by their exact term when possible.

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

export async function comparePapers(model: string, papers: ComparisonInput[]): Promise<ComparisonModelOutput> {
  const conceptIndex = papers
    .map((p) => {
      const concepts = p.analysis.concepts
        .map((c, i) => `  ${p.label}.c${i + 1}: ${c.term} — ${c.short_definition}`)
        .join("\n");
      return `Paper ${p.label}: "${p.analysis.title}"\nTL;DR: ${p.analysis.tldr}\nConcepts:\n${concepts}`;
    })
    .join("\n\n");

  const stream = client.responses.stream({
    model,
    ...reasoningFor(model, "high"),
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
  model: string,
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
    model,
    ...reasoningFor(model, "medium"),
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
  if (err instanceof OpenAI.RateLimitError) return "OpenAI rate limit or quota reached. Retry in a minute.";
  if (err instanceof OpenAI.NotFoundError) return `OpenAI: ${err.message} (does your key have access to this model?)`;
  if (err instanceof OpenAI.APIError) return `OpenAI API error (${err.status}): ${err.message}`;
  return null;
}
