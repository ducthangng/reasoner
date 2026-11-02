import { pool } from "./db.js";
import {
  analyzePaper,
  comparePapers,
  describeApiError,
  fileExists,
  LLMError,
  resolveEffort,
  uploadPdf,
  type AiSettings,
} from "./llm.js";
import { RELEVANCE_TIERS, type PaperAnalysis } from "./schemas.js";
import { readPdf } from "./storage.js";

function errorMessage(err: unknown): string {
  if (err instanceof LLMError) return err.message;
  const apiMessage = describeApiError(err);
  if (apiMessage) return apiMessage;
  console.error(err);
  return err instanceof Error ? `Unexpected error: ${err.message}` : "Unexpected error";
}

/** Returns a valid OpenAI file id for the paper, (re-)uploading the PDF if needed. */
export async function ensureFileId(paperId: string): Promise<string> {
  const { rows } = await pool.query<{ openai_file_id: string | null; filename: string }>(
    "SELECT openai_file_id, filename FROM papers WHERE id = $1",
    [paperId],
  );
  const row = rows[0];
  if (!row) throw new Error(`Paper ${paperId} not found`);
  if (row.openai_file_id && (await fileExists(row.openai_file_id))) return row.openai_file_id;

  const fileId = await uploadPdf(row.filename, await readPdf(paperId));
  await pool.query("UPDATE papers SET openai_file_id = $2 WHERE id = $1", [paperId, fileId]);
  return fileId;
}

export async function runAnalysis(paperId: string): Promise<void> {
  try {
    const fileId = await ensureFileId(paperId);
    const { rows } = await pool.query<{ model: string; effort: string | null }>(
      "SELECT model, effort FROM papers WHERE id = $1",
      [paperId],
    );
    const analysis = await analyzePaper({ model: rows[0].model, effort: resolveEffort(rows[0].effort) }, fileId);
    for (const c of analysis.concepts) {
      c.pages = [...new Set(c.pages.map(Math.round).filter((p) => p >= 1))].sort((a, b) => a - b);
    }
    // Enforce the tier order the model was asked for; the sort is stable, so its ranking within a tier is kept.
    analysis.concepts.sort((a, b) => RELEVANCE_TIERS.indexOf(a.relevance) - RELEVANCE_TIERS.indexOf(b.relevance));
    await pool.query(
      "UPDATE papers SET status = 'ready', error = NULL, title = $2, analysis = $3 WHERE id = $1",
      [paperId, analysis.title, JSON.stringify(analysis)],
    );
  } catch (err) {
    await pool.query("UPDATE papers SET status = 'error', error = $2 WHERE id = $1", [paperId, errorMessage(err)]);
  }
}

const LABELS = ["A", "B", "C", "D"];

export interface ResolvedLink {
  from: { paperId: string; concept: number };
  to: { paperId: string; concept: number };
  relation: string;
  strength: number;
  explanation: string;
}

export async function runComparison(comparisonId: string, paperIds: string[], ai: AiSettings): Promise<void> {
  try {
    const { rows } = await pool.query<{ id: string; analysis: PaperAnalysis }>(
      "SELECT id, analysis FROM papers WHERE id = ANY($1::uuid[])",
      [paperIds],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const papers = await Promise.all(
      paperIds.map(async (id, i) => ({
        id,
        label: LABELS[i],
        fileId: await ensureFileId(id),
        analysis: byId.get(id)!.analysis,
      })),
    );

    const output = await comparePapers(ai, papers);

    // Resolve "A.c3"-style keys to (paperId, conceptIndex), dropping anything malformed or self-referential.
    const resolveKey = (key: string) => {
      const m = /^([A-D])\.c(\d+)$/.exec(key.trim());
      if (!m) return null;
      const paper = papers.find((p) => p.label === m[1]);
      const concept = Number(m[2]) - 1;
      if (!paper || concept < 0 || concept >= paper.analysis.concepts.length) return null;
      return { paperId: paper.id, concept };
    };
    const links: ResolvedLink[] = [];
    for (const link of output.links) {
      const from = resolveKey(link.from);
      const to = resolveKey(link.to);
      if (!from || !to || from.paperId === to.paperId) continue;
      links.push({ ...link, from, to, strength: Math.min(3, Math.max(1, Math.round(link.strength))) });
    }

    const result = {
      overview: output.overview,
      shared_themes: output.shared_themes,
      key_differences: output.key_differences,
      learning_path: output.learning_path,
      papers: papers.map((p) => ({
        id: p.id,
        label: p.label,
        title: p.analysis.title,
        concepts: p.analysis.concepts.map((c) => ({
          term: c.term,
          relevance: c.relevance,
          category: c.category,
          short_definition: c.short_definition,
        })),
      })),
      links,
    };
    await pool.query("UPDATE comparisons SET status = 'ready', error = NULL, result = $2 WHERE id = $1", [
      comparisonId,
      JSON.stringify(result),
    ]);
  } catch (err) {
    await pool.query("UPDATE comparisons SET status = 'error', error = $2 WHERE id = $1", [
      comparisonId,
      errorMessage(err),
    ]);
  }
}
