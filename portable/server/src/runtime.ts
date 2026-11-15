// Portable replacement for the Muse platform's `@hatch/space-sdk`
// server module.
//
// The original app ran on the Muse web-artifact runtime, which provided
// `defineAction`, the `Ctx` object (database + blob storage + query
// invalidation) and Zod. This standalone version provides the same surface
// with public packages only:
//
//   * `ctx.db()`    — a Drizzle ORM client over Postgres (DATABASE_URL),
//   * `ctx.blobs`   — image storage backed by a `blobs` table in the same
//                     Postgres database, served back through `/api/blob`,
//   * `ctx.invalidateQueries()` — a no-op here: the browser client already
//                     invalidates its React Query caches after mutations.

import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import * as schema from "./schema";

export { z };

// ------------------------------------------------------------------- types

export type AppDb = PostgresJsDatabase<typeof schema>;

export interface BlobStore {
  put(
    key: string,
    bytes: Uint8Array,
    opts: { contentType: string },
  ): Promise<void>;
  getUrl(key: string): Promise<string>;
}

export interface Ctx {
  db<T extends Record<string, unknown> = typeof schema>(): PostgresJsDatabase<T>;
  blobs: BlobStore;
  invalidateQueries(): void;
}

/** A single action definition, with its Zod schemas preserved as generics
 *  so the browser client can derive exact request/response types. */
export interface DefinedAction<
  ReqSchema extends z.ZodType = z.ZodType,
  ResSchema extends z.ZodType = z.ZodType,
> {
  description: string;
  request: ReqSchema;
  response: ResSchema;
  handler: (ctx: Ctx, args: z.infer<ReqSchema>) => Promise<z.infer<ResSchema>>;
}

export function defineAction<
  ReqSchema extends z.ZodType,
  ResSchema extends z.ZodType,
>(def: DefinedAction<ReqSchema, ResSchema>): DefinedAction<ReqSchema, ResSchema> {
  return def;
}

export type ActionsModule = Record<string, DefinedAction>;

// ------------------------------------------------------------- blob storage

function makeBlobStore(db: AppDb): BlobStore {
  return {
    async put(key, bytes, opts) {
      await db
        .insert(schema.blobs)
        .values({ key, contentType: opts.contentType, data: Buffer.from(bytes) })
        .onConflictDoUpdate({
          target: schema.blobs.key,
          set: { contentType: opts.contentType, data: Buffer.from(bytes) },
        });
    },
    async getUrl(key) {
      return `/api/blob?key=${encodeURIComponent(key)}`;
    },
  };
}

export async function readBlob(
  db: AppDb,
  key: string,
): Promise<{ contentType: string; data: Buffer } | null> {
  const rows = await db
    .select()
    .from(schema.blobs)
    .where(eq(schema.blobs.key, key))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { contentType: row.contentType, data: row.data };
}

// ------------------------------------------------------------------ context

export function createCtx(db: AppDb): Ctx {
  return {
    db: <T extends Record<string, unknown>>() => db as unknown as PostgresJsDatabase<T>,
    blobs: makeBlobStore(db),
    invalidateQueries: () => undefined,
  };
}

// --------------------------------------------------------------- dispatcher

export interface DispatchResult {
  status: number;
  body: unknown;
}

export async function dispatchAction(
  actions: ActionsModule,
  ctx: Ctx,
  actionName: string,
  rawArgs: unknown,
): Promise<DispatchResult> {
  const def = actions[actionName];
  if (!def) {
    return { status: 404, body: { error: "অজানা অনুরোধ।" } };
  }
  const parsed = def.request.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { status: 400, body: { error: "অনুরোধের তথ্য সঠিক নয় — আবার চেষ্টা করুন।" } };
  }
  try {
    const result = await def.handler(ctx, parsed.data);
    const checked = def.response.safeParse(result);
    if (!checked.success) {
      console.error(`[ghorsheba] response validation failed for ${actionName}`, checked.error);
      return { status: 500, body: { error: "সার্ভারে সমস্যা হয়েছে — আবার চেষ্টা করুন।" } };
    }
    return { status: 200, body: checked.data };
  } catch (err) {
    if (err instanceof Error && err.message) {
      return { status: 400, body: { error: err.message } };
    }
    console.error(`[ghorsheba] action ${actionName} failed`, err);
    return { status: 500, body: { error: "সার্ভারে সমস্যা হয়েছে — আবার চেষ্টা করুন।" } };
  }
}
