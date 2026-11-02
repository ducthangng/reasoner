import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { MulterError } from "multer";
import { migrate } from "./db.js";
import { DEFAULT_MODEL, describeApiError, listModels } from "./llm.js";
import { comparisonsRouter } from "./routes/comparisons.js";
import { papersRouter } from "./routes/papers.js";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.get("/api/models", async (_req, res) => {
  try {
    const models = await listModels();
    res.json({ default: DEFAULT_MODEL, models: models.map((m) => m.id) });
  } catch (err) {
    // Still let the UI work with the default model if listing fails.
    res.json({ default: DEFAULT_MODEL, models: [], error: describeApiError(err) ?? "Could not list models" });
  }
});
app.use("/api/papers", papersRouter);
app.use("/api/comparisons", comparisonsRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof MulterError) {
    res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "PDF is too large (max 100 MB)." : err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

const port = Number(process.env.PORT ?? 8080);
await migrate();
app.listen(port, () => {
  console.log(`Reasoner API listening on :${port}`);
});
