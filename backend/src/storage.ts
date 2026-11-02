import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { pool } from "./db.js";

/**
 * PDF storage. With S3_BUCKET set, PDFs go to S3; otherwise (handy for local dev) they stay in Postgres.
 * Credentials come from the standard AWS env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION).
 */
const BUCKET = process.env.S3_BUCKET;
const PREFIX = (process.env.S3_PREFIX ?? "papers/").replace(/^\/+/, "");

const s3 = BUCKET
  ? new S3Client({
      region: process.env.AWS_REGION,
      // Bucket names with dots (e.g. "reasoner.example.com") break the TLS certificate of virtual-hosted URLs,
      // so address them path-style: s3.<region>.amazonaws.com/<bucket>.
      forcePathStyle: BUCKET.includes(".") || !!process.env.S3_ENDPOINT,
      // Optional, for S3-compatible stores (Cloudflare R2, MinIO, Railway buckets).
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    })
  : null;

export const storageKind = s3 ? `S3 bucket "${BUCKET}"` : "Postgres";

/** Stores the PDF for a paper and records where it lives. */
export async function savePdf(paperId: string, filename: string, pdf: Buffer): Promise<void> {
  if (!s3) {
    await pool.query("UPDATE papers SET pdf = $2 WHERE id = $1", [paperId, pdf]);
    return;
  }
  const key = `${PREFIX}${paperId}.pdf`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: pdf,
      ContentType: "application/pdf",
      ContentDisposition: `inline; filename="${encodeURIComponent(filename)}"`,
    }),
  );
  await pool.query("UPDATE papers SET s3_key = $2 WHERE id = $1", [paperId, key]);
}

interface PdfLocation {
  s3_key: string | null;
}

async function locate(paperId: string): Promise<PdfLocation | null> {
  const { rows } = await pool.query<PdfLocation>("SELECT s3_key FROM papers WHERE id = $1", [paperId]);
  return rows[0] ?? null;
}

/** Streams the PDF (from S3, or from Postgres for papers stored there). Returns null if the paper is unknown. */
export async function openPdf(paperId: string): Promise<{ stream: Readable | Buffer; size?: number } | null> {
  const loc = await locate(paperId);
  if (!loc) return null;
  if (loc.s3_key) {
    if (!s3) throw new Error("This paper is stored in S3, but S3_BUCKET is not configured.");
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: loc.s3_key }));
    return { stream: obj.Body as Readable, size: obj.ContentLength };
  }
  const { rows } = await pool.query<{ pdf: Buffer | null }>("SELECT pdf FROM papers WHERE id = $1", [paperId]);
  if (!rows[0]?.pdf) return null;
  return { stream: rows[0].pdf, size: rows[0].pdf.length };
}

/** Loads the whole PDF into memory (needed to upload it to OpenAI). */
export async function readPdf(paperId: string): Promise<Buffer> {
  const loc = await locate(paperId);
  if (!loc) throw new Error(`Paper ${paperId} not found`);
  if (loc.s3_key) {
    if (!s3) throw new Error("This paper is stored in S3, but S3_BUCKET is not configured.");
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: loc.s3_key }));
    return Buffer.from(await obj.Body!.transformToByteArray());
  }
  const { rows } = await pool.query<{ pdf: Buffer | null }>("SELECT pdf FROM papers WHERE id = $1", [paperId]);
  if (!rows[0]?.pdf) throw new Error(`PDF for paper ${paperId} is missing`);
  return rows[0].pdf;
}

export async function deletePdf(s3Key: string | null): Promise<void> {
  if (s3Key && s3) await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key })).catch(() => undefined);
}
