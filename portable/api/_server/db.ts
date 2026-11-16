// Deployment copy of `server/src/db.ts` for the Vercel functions.
// See `_server/actions.ts` for why this copy exists. It differs from the
// original only in import paths and in how the migrations directory is
// located (see `findMigrationsDir` below).
//
// Postgres connection + first-run schema setup.
//
// The database is any Postgres reachable through the `DATABASE_URL`
// environment variable — Supabase (use the connection-pooler URL), Neon,
// Railway, a local Docker Postgres, etc.
//
// On the first request the app creates its tables and seed data by running
// the SQL files in `../../drizzle/` (the same services / upazilas / settings
// seed as the original SQLite migration). Applied files are recorded in a
// `_ghorsheba_migrations` table, so restarts and extra serverless instances
// skip them. A Postgres advisory lock keeps concurrent cold starts from
// racing each other.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../server/src/schema.js";
import type { AppDb } from "./runtime.js";

let cached: { sql: postgres.Sql; db: AppDb } | null = null;
let ready: Promise<AppDb> | null = null;

function connect(): { sql: postgres.Sql; db: AppDb } {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Create a Postgres database (e.g. a free Supabase project) and set DATABASE_URL in the environment — see the README's Vercel deployment section.",
    );
  }
  // `prepare: false` keeps the client compatible with Supabase's transaction
  // pooler (port 6543). A small pool fits serverless concurrency limits.
  const sql = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(sql, { schema });
  cached = { sql, db };
  return cached;
}

// The compiled function layout differs between local runs and Vercel's
// function bundle, so locate the migrations folder by trying each known
// relative position (the SQL files are shipped with the functions via the
// `includeFiles` setting in `vercel.json`).
function findMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../drizzle"), // api/_server/db.js -> <root>/drizzle
    join(here, "../../../drizzle"), // deeper bundle nesting
    join(process.cwd(), "drizzle"),
    join(process.cwd(), "portable/drizzle"),
  ];
  for (const dir of candidates) {
    try {
      if (readdirSync(dir).some((f) => f.endsWith(".sql"))) return dir;
    } catch {
      // Not this candidate — try the next one.
    }
  }
  return candidates[0] ?? "drizzle";
}

async function runMigrations(sql: postgres.Sql): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS _ghorsheba_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  const dir = findMigrationsDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const seen = await sql`SELECT name FROM _ghorsheba_migrations WHERE name = ${file}`;
    if (seen.length > 0) continue;
    const text = readFileSync(join(dir, file), "utf8");
    const statements = text
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }
    await sql`INSERT INTO _ghorsheba_migrations (name) VALUES (${file})`;
  }
}

export function getDb(): Promise<AppDb> {
  if (!ready) {
    ready = (async () => {
      const { sql, db } = connect();
      const lock = await sql.reserve();
      try {
        await lock`SELECT pg_advisory_lock(727272)`;
        await runMigrations(sql);
      } finally {
        try {
          await lock`SELECT pg_advisory_unlock(727272)`;
        } catch {
          // Connection is being released anyway.
        }
        lock.release();
      }
      return db;
    })().catch((err) => {
      // Allow a later request to retry after a transient failure.
      ready = null;
      throw err;
    });
  }
  return ready;
}
