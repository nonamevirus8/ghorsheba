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
import * as schema from "./schema";
import type { AppDb } from "./runtime";

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
  // `connect_timeout` is firm and short: a stalled TCP/TLS connect to the
  // pooler must fail in seconds, not sit until the serverless platform
  // kills the invocation (the /api/export 300s timeout was a cold-start
  // connect/query stall with no bound at all). `idle_timeout` recycles
  // pooled connections before the pooler drops them silently, so a later
  // request never inherits a half-dead socket.
  const sql = postgres(url, {
    prepare: false,
    max: 5,
    connect_timeout: 15,
    idle_timeout: 20,
  });
  const db = drizzle(sql, { schema });
  cached = { sql, db };
  return cached;
}

// Postgres error codes that mean "this object is already there" — the
// migration is written to be idempotent (IF NOT EXISTS / ON CONFLICT DO
// NOTHING), but a database that was partially set up by an earlier,
// crashed run can still surface these. They are never fatal: the object
// the statement wanted to create exists, which is the desired end state.
const ALREADY_EXISTS_CODES = new Set(["42P07", "42710", "42P06", "42723"]);

function isAlreadyExistsError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; message?: unknown };
  if (typeof e.code === "string" && ALREADY_EXISTS_CODES.has(e.code)) {
    return true;
  }
  return (
    typeof e.message === "string" && /already exists/i.test(e.message)
  );
}

type SqlLike = postgres.Sql | postgres.ReservedSql;

function migrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function appliedMigrations(sql: SqlLike): Promise<Set<string>> {
  const rows = await sql`SELECT name FROM _ghorsheba_migrations`;
  return new Set(rows.map((r) => String(r.name)));
}

// Master Phase 12 (loading speed): once every migration file is recorded
// as applied — the steady state of the deployed site — a cold start needs
// no advisory lock and no per-file round trips: two queries on the pooled
// connection prove the schema is current and startup proceeds. Any doubt
// (table missing, unreadable directory, query error) returns false and
// the caller takes the original locked migration path unchanged.
async function migrationsComplete(sql: SqlLike, dir: string): Promise<boolean> {
  try {
    await sql`CREATE TABLE IF NOT EXISTS _ghorsheba_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    const files = migrationFiles(dir);
    if (files.length === 0) return false;
    const applied = await appliedMigrations(sql);
    return files.every((f) => applied.has(f));
  } catch {
    return false;
  }
}

async function runMigrations(sql: SqlLike, dir: string): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS _ghorsheba_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  const files = migrationFiles(dir);
  // One query for the whole applied set (was: one SELECT per file —
  // eleven extra round trips to the pooler on every cold start).
  const applied = await appliedMigrations(sql);
  for (const file of files) {
    if (applied.has(file)) continue;
    const text = readFileSync(join(dir, file), "utf8");
    const statements = text
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
      } catch (err) {
        // Idempotency guard: a table/index/type left behind by a previous
        // partial run must not fail the whole startup. Skip and continue.
        if (isAlreadyExistsError(err)) continue;
        throw err;
      }
    }
    await sql`INSERT INTO _ghorsheba_migrations (name) VALUES (${file}) ON CONFLICT (name) DO NOTHING`;
  }
}

export function getDb(): Promise<AppDb> {
  if (!ready) {
    ready = (async () => {
      const { sql, db } = connect();
      const dir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
      // Fast path: schema already current → no lock, no migration run.
      if (await migrationsComplete(sql, dir)) return db;
      // Run the lock AND the migrations on one reserved connection.
      // Previously the advisory lock was taken on the reserved connection
      // while the migrations ran through the pool — different backends —
      // so the lock protected nothing and the unlock warned
      // "you don't own a lock of type ExclusiveLock".
      //
      // Behind Supabase's transaction pooler (port 6543) a session-level
      // advisory lock may not be grantable at all, so use the try-variant:
      // if we get the lock, hold it for the migration and unlock only
      // then; if we don't, proceed anyway — the migrations are
      // idempotent, so concurrent cold starts converge safely.
      const lock = await sql.reserve();
      let locked = false;
      try {
        for (let attempt = 0; attempt < 20 && !locked; attempt++) {
          try {
            const rows = await lock`SELECT pg_try_advisory_lock(727272) AS locked`;
            locked = rows[0]?.locked === true;
          } catch {
            // Pooler refused the lock call entirely — run unlocked.
            locked = false;
            break;
          }
          if (!locked) {
            await new Promise((r) => setTimeout(r, 250));
          }
        }
        await runMigrations(lock, dir);
      } finally {
        if (locked) {
          try {
            await lock`SELECT pg_advisory_unlock(727272)`;
          } catch {
            // Only unlock when we hold the lock; a pooler warning or a
            // dropped backend here must never fail startup.
          }
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
