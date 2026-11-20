// IndexNow (SEO Phase 5) — server-side only.
//
// When public content changes (a service is saved, a professional is
// verified or unverified, locations change), the affected canonical
// URLs are submitted to IndexNow (Bing, Yandex, …) so search engines
// re-crawl them promptly. Deletions/unpublications are submitted the
// same way — IndexNow treats a submitted URL that now returns
// 404/410 or a redirect as a removal signal.
//
// The API key comes ONLY from the INDEXNOW_KEY environment variable.
// It is never in frontend JavaScript, never in this repository, and
// never returned to a client. The matching key file is served by
// `api/indexnow-key.ts` at /indexnow-key.txt (the keyLocation given
// to IndexNow below).
//
// When INDEXNOW_KEY is not set, this integration is INERT by design:
// notifyIndexNow logs one line and returns { skipped: true } without
// any network call. Callers fire-and-forget — a notification failure
// must never fail the admin action that triggered it.

export const INDEXNOW_HOST = "mistridako.vercel.app";
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/indexnow-key.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export function seoUrl(path: string): string {
  return `https://${INDEXNOW_HOST}${path}`;
}

export interface IndexNowResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
}

export async function notifyIndexNow(
  urls: string[],
  keyOverride?: string,
): Promise<IndexNowResult> {
  const key = keyOverride ?? process.env.INDEXNOW_KEY;
  if (!key) {
    console.info(
      `[indexnow] INDEXNOW_KEY not set — skipping notification for ${urls.length} URL(s).`,
    );
    return { ok: false, skipped: true };
  }
  const unique = [...new Set(urls)].filter((u) =>
    u.startsWith(`https://${INDEXNOW_HOST}/`),
  );
  if (unique.length === 0) return { ok: true, status: 0 };
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: INDEXNOW_HOST,
        key,
        keyLocation: INDEXNOW_KEY_LOCATION,
        urlList: unique.slice(0, 10_000),
      }),
    });
    if (!res.ok) {
      console.error(`[indexnow] submission failed: HTTP ${res.status}`);
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.error("[indexnow] submission error", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
