import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS papers (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      filename          text NOT NULL,
      title             text,
      size_bytes        integer NOT NULL,
      pdf               bytea,
      s3_key            text,
      openai_file_id    text,
      model             text NOT NULL,
      effort            text,
      status            text NOT NULL DEFAULT 'processing',
      error             text,
      analysis          jsonb,
      created_at        timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS comparisons (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      paper_ids  uuid[] NOT NULL,
      model      text NOT NULL,
      effort     text,
      status     text NOT NULL DEFAULT 'processing',
      error      text,
      result     jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         bigserial PRIMARY KEY,
      paper_id   uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      role       text NOT NULL,
      content    text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS chat_messages_paper_idx ON chat_messages(paper_id, id);

    -- Columns added after the first version, for databases created before them.
    ALTER TABLE papers ADD COLUMN IF NOT EXISTS openai_file_id text;
    ALTER TABLE papers ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'gpt-5.5-2026-04-23';
    ALTER TABLE papers ADD COLUMN IF NOT EXISTS effort text;
    ALTER TABLE papers ADD COLUMN IF NOT EXISTS s3_key text;
    ALTER TABLE papers ADD COLUMN IF NOT EXISTS instructions text;
    ALTER TABLE papers ALTER COLUMN pdf DROP NOT NULL;
    ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'gpt-5.5-2026-04-23';
    ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS effort text;
  `);

  // Background jobs run in-process, so anything still "processing" was interrupted by a restart.
  await pool.query(
    `UPDATE papers SET status = 'error', error = 'Analysis was interrupted by a server restart. Retry it.'
     WHERE status = 'processing'`,
  );
  await pool.query(
    `UPDATE comparisons SET status = 'error', error = 'Comparison was interrupted by a server restart. Retry it.'
     WHERE status = 'processing'`,
  );
}
