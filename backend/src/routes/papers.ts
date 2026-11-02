import { Router } from "express";
import multer from "multer";
import { pool } from "../db.js";
import { ensureFileId, runAnalysis } from "../jobs.js";
import { chatAboutPaper, deleteUploadedFile, describeApiError, resolveModel, type ChatTurn } from "../llm.js";
import { isUuid } from "../util.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

export const papersRouter = Router();

papersRouter.param("id", (req, res, next, id) => {
  if (!isUuid(id)) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }
  next();
});

const SUMMARY_COLUMNS = "id, filename, title, size_bytes, model, status, error, created_at";

papersRouter.get("/", async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${SUMMARY_COLUMNS} FROM papers ORDER BY created_at DESC`);
  res.json(rows);
});

papersRouter.post("/", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Upload a PDF in the 'file' field." });
    return;
  }
  if (file.mimetype !== "application/pdf" && !file.originalname.toLowerCase().endsWith(".pdf")) {
    res.status(400).json({ error: "Only PDF files are supported." });
    return;
  }
  if (file.buffer.subarray(0, 5).toString() !== "%PDF-") {
    res.status(400).json({ error: "That file does not look like a valid PDF." });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO papers (filename, size_bytes, pdf, model) VALUES ($1, $2, $3, $4) RETURNING ${SUMMARY_COLUMNS}`,
    [file.originalname, file.size, file.buffer, resolveModel(req.body?.model)],
  );
  void runAnalysis(rows[0].id);
  res.status(201).json(rows[0]);
});

papersRouter.get("/:id", async (req, res) => {
  const { rows } = await pool.query(`SELECT ${SUMMARY_COLUMNS}, analysis FROM papers WHERE id = $1`, [req.params.id]);
  if (!rows[0]) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }
  res.json(rows[0]);
});

papersRouter.get("/:id/pdf", async (req, res) => {
  const { rows } = await pool.query<{ pdf: Buffer; filename: string }>(
    "SELECT pdf, filename FROM papers WHERE id = $1",
    [req.params.id],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(rows[0].filename)}"`);
  res.setHeader("Cache-Control", "private, max-age=86400, immutable");
  res.send(rows[0].pdf);
});

papersRouter.post("/:id/reanalyze", async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE papers SET status = 'processing', error = NULL, model = coalesce($2, model)
     WHERE id = $1 AND status <> 'processing'
     RETURNING ${SUMMARY_COLUMNS}`,
    [req.params.id, req.body?.model ? resolveModel(req.body.model) : null],
  );
  if (!rows[0]) {
    res.status(409).json({ error: "Paper not found or already processing" });
    return;
  }
  void runAnalysis(rows[0].id);
  res.json(rows[0]);
});

papersRouter.delete("/:id", async (req, res) => {
  const { rows } = await pool.query<{ openai_file_id: string | null }>(
    "DELETE FROM papers WHERE id = $1 RETURNING openai_file_id",
    [req.params.id],
  );
  if (rows[0]?.openai_file_id) void deleteUploadedFile(rows[0].openai_file_id);
  res.status(204).end();
});

papersRouter.get("/:id/chat", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, role, content, created_at FROM chat_messages WHERE paper_id = $1 ORDER BY id",
    [req.params.id],
  );
  res.json(rows);
});

papersRouter.delete("/:id/chat", async (req, res) => {
  await pool.query("DELETE FROM chat_messages WHERE paper_id = $1", [req.params.id]);
  res.status(204).end();
});

/** Streams the answer as server-sent events: {delta} chunks, then {done} or {error}. */
papersRouter.post("/:id/chat", async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    res.status(400).json({ error: "Ask a question." });
    return;
  }
  const paper = await pool.query<{ model: string }>("SELECT model FROM papers WHERE id = $1", [req.params.id]);
  if (!paper.rows[0]) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }
  const history = await pool.query<ChatTurn>(
    "SELECT role, content FROM chat_messages WHERE paper_id = $1 ORDER BY id",
    [req.params.id],
  );

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const fileId = await ensureFileId(req.params.id);
    const answer = await chatAboutPaper(
      resolveModel(req.body?.model ?? paper.rows[0].model),
      fileId,
      history.rows,
      question,
      (delta) => send({ delta }),
    );
    await pool.query(
      "INSERT INTO chat_messages (paper_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)",
      [req.params.id, question, answer],
    );
    send({ done: true });
  } catch (err) {
    console.error(err);
    send({ error: describeApiError(err) ?? (err instanceof Error ? err.message : "Something went wrong") });
  }
  res.end();
});
