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

## Run locally

```bash
cp .env.example .env   # fill in DATABASE_URL
bun install            # or: npm install
bun run dev            # or: npm run dev
```

## Notes

- Every dependency comes from the public npm registry — `bun install` /
  `npm install` works on any machine, including Vercel's build servers.
- No secrets are stored in this repository. `DATABASE_URL` is the only
  required environment variable; `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` are optional and currently unused by the
  app. Real values belong only in Vercel's environment settings or a
  local `.env` file — never in code or in this repository.
- The six photos under `client/src/assets/` are binary files; if they are
  missing from a checkout, the affected spots render the app's icon
  treatment instead (the components already handle absent images).
