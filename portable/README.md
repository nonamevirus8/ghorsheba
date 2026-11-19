# GhorSheba — portable (Vercel) edition

This folder is a complete, self-contained copy of the GhorSheba app that
runs anywhere — no Muse/Hatch platform packages. It is the same app with
the same features and workflows as the platform build at the repository
root; only the plumbing differs:

| Piece            | Platform build (repo root)     | This portable build              |
| ---------------- | ------------------------------ | -------------------------------- |
| Frontend build   | Muse runtime bundler         | Vite (`vite build` → `dist/`)    |
| Server           | Muse server actions          | Vercel functions in `api/`       |
| Action transport | platform RPC                   | `POST /api/actions` JSON         |
| Database         | platform SQLite                | Postgres via `DATABASE_URL`      |
| Photo storage    | platform blob store            | `blobs` table in the same Postgres |
| Schema + seed    | `../drizzle/0002_…sql` (SQLite)| `drizzle/0001_…sql` (Postgres)   |

**Live site: https://ghorsheba-bd.vercel.app** — this is the production
deployment of this portable edition (the older address
https://ghorsheba-ashen.vercel.app still works too). The site is an
installable PWA: users can install it as an app from the
[#/download-app](https://ghorsheba-bd.vercel.app/#/download-app) page —
see "Mobile app (PWA) + download page" below.

## Deploy on Vercel

The Supabase project for this deployment already exists:
**https://veygdvejfgkjvsxeztsz.supabase.co** (project ref
`veygdvejfgkjvsxeztsz`, database host `db.veygdvejfgkjvsxeztsz.supabase.co`).

1. **Get the database connection string** in Supabase → **Settings →
   Database**: either the direct URI
   `postgresql://postgres:<your-password>@db.veygdvejfgkjvsxeztsz.supabase.co:5432/postgres`
   or the **Transaction pooler** URI from the same page (recommended for
   serverless). Only you know the database password — it never goes in
   this repository.
2. **Import this repository in Vercel** and set **Root Directory** to
   `portable` (Project → Settings → General, or during import).
3. **Add the environment variable** `DATABASE_URL` with the connection
   string from step 1 (Settings → Environment Variables). Optionally also
   set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
   (Supabase → Settings → API) — the app does not use them yet; they are
   reserved for future Supabase Auth/Storage features. See `.env.example`.
4. **Deploy.** On the first request the app creates its tables and seed
   data automatically (12 services, 12 Tangail upazilas, platform
   settings). No manual migration step is required; `npm run db:migrate`
   exists if you prefer to prepare the database ahead of time.
5. Open the deployed site, go to Login and use **"প্রথম অ্যাডমিন অ্যাকাউন্ট
   সেটআপ করুন"** to claim the first admin account (shown only while no
   admin exists).

## How the API functions are laid out (Vercel fix, 2026-11-16)

The first live deployment served the site but every `POST /api/actions`
failed with `500 FUNCTION_INVOCATION_FAILED`. Vercel's Runtime Logs
showed the function dying at import time:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/var/task/portable/server/src/actions' imported from
/var/task/portable/api/actions.js
```

The database was never the problem: `api/actions.ts` imported
`../server/src/actions` with an extensionless specifier, and Vercel's
file tracer did not include the cross-directory server modules in the
function bundle, so Node's ESM loader crashed before any code ran.

The fix, now in place:

- `api/_server/` holds deployment copies of `server/src/actions.ts`,
  `server/src/db.ts` and `server/src/runtime.ts` — inside `api/`, where
  the tracer always includes them — importing the shared schema from
  `../../server/src/schema.js` with explicit `.js` ESM specifiers.
  **Keep `api/_server/*` in sync with `server/src/*`** (identical except
  import paths, plus a more defensive migrations-directory lookup in
  `db.ts`).
- `vercel.json` sets `includeFiles: "drizzle/**"` for both functions so
  the migration/seed SQL ships inside the function bundle (the app
  applies it automatically on first request).
- Verified locally by compiling the `api/` tree to plain JS in the same
  layout Vercel produces, importing it with Node ESM (no missing-module
  error), and running the compiled handler end-to-end against a real
  PostgreSQL server: catalog (12 services + 12 locations), registration
  and login, professional verification, the full booking journey
  (pending → assigned → accepted → in progress → done → completed),
  a ৳800 cash payment, review moderation and role enforcement — all
  passing.

## Mobile app (PWA) + download page

GhorSheba is an installable Progressive Web App — no Play Store / App
Store account needed:

- `public/manifest.webmanifest` — name GhorSheba, `display: standalone`,
  theme/background `#087A35`, start URL `/`.
- Icons: `public/icon.svg` is the brand mark; the PNG icons (192, 512,
  maskable 512, apple-touch 180) are **generated from code at build
  time** by `scripts/generate-icons.mjs` (run as part of
  `npm run build`) into `dist/` — no binary icon files live in the repo.
- `public/sw.js` — service worker caching the app shell (never the API),
  registered from `client/src/main.tsx`.
- `#/download-app` — a Bengali landing page (linked from the homepage
  banner, the mobile menu and the footer as "অ্যাপ ডাউনলোড করুন") with a
  working Android install button (`beforeinstallprompt`), manual
  Android steps, and iPhone/iPad Safari "Add to Home Screen" steps.
  On the live site: https://ghorsheba-bd.vercel.app/#/download-app

## Data export (owner only)

With the optional `EXPORT_TOKEN` environment variable set (see
`.env.example`), one read-only JSON endpoint is available:

- `GET /api/export?token=<EXPORT_TOKEN>` — business records for the
  owner's spreadsheet sync: bookings, payments, professionals, reviews
  and the financial ledger. This feed never contains password hashes,
  session tokens, NID numbers or identity-document data.

The token is compared in constant time. While `EXPORT_TOKEN` is unset,
or when the token is missing or wrong, the endpoint answers 404 as if
it did not exist. It never writes to the database. There is
deliberately no full-database mode: restorable backups belong in a
separate owner-only channel (e.g. a database dump), not behind a
query-string token.

## Online payments — Manual TrxID + SSLCOMMERZ sandbox (Phase 8)

Two collection paths exist side by side; both write the same payment
and ledger records, and both are priced by the server from the
booking's snapshotted Dual Payment rates:

- **Manual TrxID (default, always available):** the customer sends
  money to the MFS number an admin sets in Platform Settings and
  submits the TrxID; a Finance Admin verifies it.
- **SSLCOMMERZ gateway (sandbox only, optional):** appears at checkout
  only when the owner sets `SSLCOMMERZ_STORE_ID`,
  `SSLCOMMERZ_STORE_PASSWD` and `SSLCOMMERZ_SANDBOX=true` in the Vercel
  environment (see `.env.example`). The code contains ONLY the sandbox
  endpoints and refuses to run in any other mode — going live is a
  separate, separately-approved provider arrangement (live carries a
  one-time setup fee plus a per-transaction percentage). A payment is
  marked successful ONLY after the server verifies it through the
  SSLCOMMERZ Order Validation API: the gateway's IPN
  (`POST /api/sslcommerz/ipn`) and the browser return
  (`POST /api/sslcommerz/return`) both run the signature check +
  validation before settling, and duplicate callbacks are no-ops.
  Pathao Pay remains a labelled placeholder — it has no public
  merchant API.

To test the gateway: create a free SSLCOMMERZ sandbox store, set the
three variables in Vercel, redeploy, and pay at checkout with the
sandbox's test credentials.

## Run locally

```bash
cp .env.example .env   # fill in DATABASE_URL
bun install            # or: npm install
bun run dev            # or: npm run dev
```

## Operations (Phase 12)

- **Runbook**: `docs/OPERATIONS-RUNBOOK.md` — incident procedures (site
  down, payment dispute, wrong data, suspected compromise), backup &
  recovery, the owner-only database-password rotation steps, the
  production test-data deletion list, and the known open items.
- **Test-data cleanup**: `scripts/cleanup-test-data.mjs` — dry-run by
  default; prints every row belonging to the known test accounts and
  deletes only with `--execute --confirm=<phones>`, in one transaction.
  Prepared in Phase 12; **not yet run against production**.

## Notes

- Every dependency comes from the public npm registry — `bun install` /
  `npm install` works on any machine, including Vercel's build servers.
- No secrets are stored in this repository. `DATABASE_URL` is the only
  required environment variable; `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` are optional and currently unused by the
  app. Real values belong only in Vercel's environment settings or a
  local `.env` file — never in code or in this repository.
- The six photos are binary files that were never pushed to this
  repository (text-only push), and importing them broke the Vite build.
  The hero, mistri banner and four service headers therefore use inline
  SVG illustrations from `client/src/illustrations.ts` (text-only data
  URIs, no binary files needed). To restore the real photos, add them
  with a regular git client and import them in `client/src/App.tsx`
  again.
