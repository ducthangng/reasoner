import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Requires the X-Analyze-Password header to match ANALYZE_PASSWORD before starting an analysis.
 * Fails closed: if the server has no password configured, no analysis can start.
 */
export const requireAnalyzePassword: RequestHandler = (req, res, next) => {
  const expected = process.env.ANALYZE_PASSWORD;
  if (!expected) {
    res.status(503).json({ error: "Analysis is disabled: ANALYZE_PASSWORD is not set on the server." });
    return;
  }
  const given = req.get("x-analyze-password") ?? "";
  // Hash both sides so the comparison is constant-time regardless of length.
  if (!timingSafeEqual(sha256(given), sha256(expected))) {
    res.status(401).json({ error: "Wrong password. The analysis was not started." });
    return;
  }
  next();
};
