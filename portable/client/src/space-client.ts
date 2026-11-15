// Portable replacement for the Muse platform's `@hatch/space-sdk/client`.
//
// The original app ran on the Muse web-artifact runtime, which injected
// this module. This standalone version provides the exact same surface the
// app code uses — a typed action client, a shared React Query client and a
// file-to-base64 helper — implemented with plain web APIs only:
//
//   * actions are POSTed as JSON `{ action, args }` to `/api/actions`
//     (see `api/actions.ts` at the project root), and
//   * handler errors come back as `{ error: string }` and are re-thrown as
//     `Error`s so the UI shows the server's message, exactly as before.

import { QueryClient } from "@tanstack/react-query";
import type { z } from "zod";

export const spaceQueryClient = new QueryClient();

// ------------------------------------------------------------- action types

type SchemaOutput<S> = S extends z.ZodType ? z.infer<S> : never;

type ActionDefOf<T> = T extends {
  request: infer Req;
  response: infer Res;
}
  ? { request: SchemaOutput<Req>; response: SchemaOutput<Res> }
  : never;

type ActionClient<TActions> = {
  [K in keyof TActions]: (
    args: ActionDefOf<TActions[K]>["request"],
  ) => Promise<ActionDefOf<TActions[K]>["response"]>;
};

export type ApiRequest<TClient, K extends keyof TClient> =
  TClient[K] extends (args: infer A) => unknown ? A : never;

export type ApiResponse<TClient, K extends keyof TClient> =
  TClient[K] extends (args: never) => Promise<infer R> ? R : never;

// ------------------------------------------------------------ action client

async function callAction(action: string, args: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, args: args ?? {} }),
    });
  } catch {
    throw new Error("সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না — ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।");
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data !== null &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : "কিছু একটা সমস্যা হয়েছে — আবার চেষ্টা করুন।";
    throw new Error(message);
  }
  return data;
}

export function createActionClient<TActions>(): ActionClient<TActions> {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        return (args: unknown) => callAction(prop, args);
      },
    },
  ) as ActionClient<TActions>;
}

// -------------------------------------------------------------- file helper

export async function fileToBase64(
  file: File,
): Promise<{ dataBase64: string; mimeType: string }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return { dataBase64: btoa(binary), mimeType: file.type };
}
