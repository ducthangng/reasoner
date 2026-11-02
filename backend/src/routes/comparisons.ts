import { Router } from "express";
import { pool } from "../db.js";
import { runComparison } from "../jobs.js";
import { resolveModel } from "../llm.js";
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
    `SELECT c.id, c.paper_ids, c.model, c.status, c.error, c.created_at,
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
  const model = resolveModel(req.body?.model);
  const { rows } = await pool.query(
    "INSERT INTO comparisons (paper_ids, model) VALUES ($1::uuid[], $2) RETURNING id, paper_ids, model, status, error, created_at",
    [paperIds, model],
  );
  void runComparison(rows[0].id, paperIds as string[], model);
  res.status(201).json(rows[0]);
});

comparisonsRouter.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, paper_ids, model, status, error, result, created_at FROM comparisons WHERE id = $1",
    [req.params.id],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Comparison not found" });
    return;
  }
  res.json(rows[0]);
});

comparisonsRouter.post("/:id/retry", async (req, res) => {
  const { rows } = await pool.query<{ id: string; paper_ids: string[]; model: string }>(
    `UPDATE comparisons SET status = 'processing', error = NULL, model = coalesce($2, model)
     WHERE id = $1 AND status = 'error'
     RETURNING id, paper_ids, model, status, error, created_at`,
    [req.params.id, req.body?.model ? resolveModel(req.body.model) : null],
  );
  if (!rows[0]) {
    res.status(409).json({ error: "Comparison not found or not in an error state" });
    return;
  }
  void runComparison(rows[0].id, rows[0].paper_ids, rows[0].model);
  res.json(rows[0]);
});

comparisonsRouter.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM comparisons WHERE id = $1", [req.params.id]);
  res.status(204).end();
});
