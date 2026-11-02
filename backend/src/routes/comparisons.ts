import { Router } from "express";
import { pool } from "../db.js";
import { runComparison } from "../jobs.js";
import { resolveEffort, resolveModel } from "../llm.js";
import { isUuid } from "../util.js";

export const comparisonsRouter = Router();

comparisonsRouter.param("id", (req, res, next, id) => {
  if (!isUuid(id)) {
    res.status(404).json({ error: "Comparison not found" });
    return;
  }
  next();
});

comparisonsRouter.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.paper_ids, c.model, c.effort, c.status, c.error, c.created_at,
            array(SELECT coalesce(p.title, p.filename) FROM unnest(c.paper_ids) WITH ORDINALITY u(pid, ord)
                  JOIN papers p ON p.id = u.pid ORDER BY u.ord) AS paper_titles
     FROM comparisons c ORDER BY c.created_at DESC`,
  );
  res.json(rows);
});

comparisonsRouter.post("/", async (req, res) => {
  const paperIds: unknown = req.body?.paperIds;
  if (
    !Array.isArray(paperIds) ||
    paperIds.length < 2 ||
    paperIds.length > 4 ||
    !paperIds.every((id) => typeof id === "string" && isUuid(id)) ||
    new Set(paperIds).size !== paperIds.length
  ) {
    res.status(400).json({ error: "Choose between 2 and 4 different papers." });
    return;
  }
  const ready = await pool.query("SELECT id FROM papers WHERE id = ANY($1::uuid[]) AND status = 'ready'", [paperIds]);
  if (ready.rowCount !== paperIds.length) {
    res.status(400).json({ error: "All selected papers must finish analysis first." });
    return;
  }
  const ai = { model: resolveModel(req.body?.model), effort: resolveEffort(req.body?.effort) };
  const { rows } = await pool.query(
    `INSERT INTO comparisons (paper_ids, model, effort) VALUES ($1::uuid[], $2, $3)
     RETURNING id, paper_ids, model, effort, status, error, created_at`,
    [paperIds, ai.model, ai.effort],
  );
  void runComparison(rows[0].id, paperIds as string[], ai);
  res.status(201).json(rows[0]);
});

comparisonsRouter.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, paper_ids, model, effort, status, error, result, created_at FROM comparisons WHERE id = $1",
    [req.params.id],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Comparison not found" });
    return;
  }
  res.json(rows[0]);
});

comparisonsRouter.post("/:id/retry", async (req, res) => {
  const { rows } = await pool.query<{ id: string; paper_ids: string[]; model: string; effort: string | null }>(
    `UPDATE comparisons SET status = 'processing', error = NULL, model = $2, effort = $3
     WHERE id = $1 AND status = 'error'
     RETURNING id, paper_ids, model, effort, status, error, created_at`,
    [req.params.id, resolveModel(req.body?.model), resolveEffort(req.body?.effort)],
  );
  if (!rows[0]) {
    res.status(409).json({ error: "Comparison not found or not in an error state" });
    return;
  }
  void runComparison(rows[0].id, rows[0].paper_ids, {
    model: rows[0].model,
    effort: resolveEffort(rows[0].effort),
  });
  res.json(rows[0]);
});

comparisonsRouter.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM comparisons WHERE id = $1", [req.params.id]);
  res.status(204).end();
});
