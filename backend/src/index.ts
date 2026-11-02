import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { MulterError } from "multer";
import { migrate } from "./db.js";
import { storageKind } from "./storage.js";
import { DEFAULT_MODEL, describeApiError, EFFORTS, listModels, RESEARCH_MODELS } from "./llm.js";
import { comparisonsRouter } from "./routes/comparisons.js";
import { papersRouter } from "./routes/papers.js";

for (const name of ["OPENAI_API_KEY", "DATABASE_URL", "ANALYZE_PASSWORD"]) {
  if (!process.env[name]) console.warn(`Warning: ${name} is not set. See backend/.env.example.`);
}

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
    res.json({ default: DEFAULT_MODEL, models, efforts: EFFORTS });
  } catch (err) {
    // Still let the UI work with the default model if listing fails.
    res.json({
      default: DEFAULT_MODEL,
      models: RESEARCH_MODELS,
      efforts: EFFORTS,
      error: describeApiError(err) ?? "Could not list models",
    });
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
try {
  await migrate();
} catch (err) {
  console.error(
    `Could not connect to Postgres at DATABASE_URL. Is the database running? (Locally: npm run db:local)\n`,
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
}
app.listen(port, () => {
  console.log(`Reasoner API listening on :${port} (PDFs stored in ${storageKind})`);
});
