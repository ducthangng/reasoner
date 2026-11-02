// Starts a local Postgres for development (no Docker or Homebrew needed). Data persists in backend/.pgdata.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dataDir = new URL("../.pgdata", import.meta.url).pathname;
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: 5433,
  persistent: true,
});

if (!existsSync(dataDir)) await pg.initialise();
await pg.start();
await pg.createDatabase("reasoner").catch(() => undefined); // already exists
console.log("Local Postgres ready: postgres://postgres:postgres@localhost:5433/reasoner (Ctrl+C to stop)");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
