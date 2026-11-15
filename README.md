# GhorSheba (ঘরসেবা)

**Your Home. Our Responsibility.**

GhorSheba is a home-service marketplace for Tangail, Bangladesh. It connects
customers with verified local professionals — electricians, plumbers, masons,
painters, carpenters, AC technicians, tile workers, cleaners and renovation
contractors — through an admin-coordinated booking workflow.

The site is primarily in Bengali (বাংলা) with English as a secondary language,
and all prices are in Bangladeshi Taka (৳).

## How it works

1. A customer registers and submits a booking request for a service.
2. An admin reviews the request and assigns a suitable verified professional.
3. The professional accepts the job, completes the work, and marks it done.
4. The customer confirms completion and can leave a review.
5. Payment is cash, recorded by an authorized admin (no online payment
   gateway is integrated).

Booking statuses: `Pending → Confirmed → Provider Assigned → In Progress →
Completed` (or `Cancelled`). Every booking gets a unique ID and a full status
history.

## Features

- **Homepage** — service catalogue, how-it-works, professional listings and
  reviews (real data only; no fabricated ratings or testimonials).
- **Customer panel** — registration/login, booking form with photo upload,
  booking tracking, completion confirmation, reviews and complaints.
- **Professional panel** — registration with admin verification, job list,
  accept/reject, start/finish work, availability toggle.
- **Admin panel** — booking management and assignment, professional
  verification, review moderation, complaint handling, service and pricing
  management, platform settings (commission %, support contacts) and an
  activity log.
- **Roles & security** — customer / professional / admin roles are enforced
  in the server actions, not just in the UI. Passwords are stored salted and
  hashed; sessions are server-side tokens.

## Tech stack

- **Frontend:** React 19 + TypeScript, Tailwind CSS v4, TanStack Query,
  Recharts, Lucide icons. Fonts: Hind Siliguri (Bengali) + Inter (English).
- **Backend:** TypeScript server actions with Zod-validated request/response
  schemas, running on the Bun runtime.
- **Database:** SQLite via Drizzle ORM. The schema mirrors the product's
  logical collections: `users`, `professionals`, `services`, `bookings`,
  `booking_events`, `reviews`, `notifications`, `complaints`, `locations`,
  `settings`, `admin_logs`, `sessions`.
- **Images:** uploaded photos are stored as binary blobs referenced by key
  from the database.

## Repository layout

```
client/            React frontend
  src/App.tsx        Homepage and public pages
  src/booking.tsx    Booking flow
  src/panels.tsx     Customer / professional / admin panels
  src/lib.tsx        Shared UI helpers
  src/api.ts         Typed client for the server actions
server/
  src/actions.ts     All server actions (auth, bookings, admin, …)
  src/schema.ts      Drizzle database schema
drizzle/           SQL migrations
  0002_…sql          Core tables + seed data (see below)
portable/          Standalone Vercel edition (Vite + API functions +
                   Postgres) — see "Deploying on Vercel" below
```

## Seed data

Migration `drizzle/0002_ghorsheba_core_tables_and_catalog_seed.sql` creates
the core tables and seeds the platform reference data:

- **12 services:** Electrician, Plumber, Mason, Painter, Carpenter,
  AC Technician, Tile Worker, Welding, Cleaning, Glass & Aluminium,
  Renovation, Pest Control.
- **12 Tangail upazilas (locations):** Tangail Sadar, Ghatail, Kalihati,
  Mirzapur, Sakhipur, Basail, Madhupur, Nagarpur, Delduar, Bhuapur,
  Gopalpur, Dhanbari.
- **1 platform settings row** (default 10% commission; support contacts are
  left empty for the admin to fill in).

No demo users, professionals, bookings or reviews are seeded — those are
created only through real in-app registrations and bookings.

## Running locally

This project was built for the Muse web-artifact runtime, which provides
the `@hatch/space-sdk` package (typed action client/server plumbing) and
hosts the app. To explore or typecheck the code outside that runtime you
need [Bun](https://bun.sh) 1.3+:

```bash
bun install        # resolves dependencies (see note below)
bun run typecheck  # typechecks client and server
bun run build      # builds server actions and the client bundle
```

> **Note:** the root `package.json` references `@hatch/space-sdk` from a
> local path provided by the Muse platform, so `bun install` at the
> repository root only completes inside that environment. For a standalone
> deployment (Vercel, local machine, any host), use the portable edition
> in [`portable/`](portable/) described below — it has no platform
> dependencies at all.

The first admin account is claimed from the app's login screen ("প্রথম
অ্যাডমিন অ্যাকাউন্ট সেটআপ করুন") — that option appears only while no admin
exists.

## Deploying on Vercel (portable edition)

The [`portable/`](portable/) folder is a complete, self-contained copy of
this app that builds and runs on Vercel with plain `bun install` /
`npm install` from the public npm registry — no Muse/Hatch packages.
It keeps every feature and workflow of the platform build (homepage,
customer / professional / admin panels, the full booking flow, reviews,
cash payment recording); only the plumbing differs: Vite builds the
frontend, Vercel serverless functions in `portable/api/` serve the
actions, and data lives in a Postgres database (Drizzle ORM) instead of
the platform's SQLite + blob storage. Uploaded photos are stored in a
`blobs` table in the same Postgres database.

**Steps:**

1. **Use the Supabase Postgres database.** The project for this
   deployment already exists: **https://veygdvejfgkjvsxeztsz.supabase.co**
   (project ref `veygdvejfgkjvsxeztsz`, database host
   `db.veygdvejfgkjvsxeztsz.supabase.co`). In Supabase → **Settings →
   Database** you can copy the connection string — either the direct URI
   (`postgresql://postgres:<your-password>@db.veygdvejfgkjvsxeztsz.supabase.co:5432/postgres`)
   or the **Transaction pooler** URI (recommended for serverless). Only
   you know the database password; it is never stored in this repository.
   (Any other Postgres — Neon, Railway, self-hosted — would also work.)
2. **Import this repository in Vercel** (Add New → Project → select
   `nonamevirus8/ghorsheba`).
3. **Set the Root Directory to `portable`** — in the import screen, or
   later under Project → Settings → General → Root Directory. This is
   required: the repository root is the Muse-platform build, whose
   `package.json` points at a platform-local SDK file that does not exist
   on Vercel.
4. **Add the environment variable** below (Project → Settings →
   Environment Variables, for Production — and Preview if you want
   preview deployments to work too).
5. **Deploy.** The first request automatically creates the tables and
   seed data (the same 12 services, 12 Tangail upazilas and settings row
   as migration `portable/drizzle/0001_ghorsheba_portable_pg.sql`). To
   prepare the database ahead of time instead, run
   `bun run db:migrate` inside `portable/` with `DATABASE_URL` set, or
   paste that SQL file into the Supabase SQL editor.
6. Open the deployed site, go to **Login** and use **"প্রথম অ্যাডমিন
   অ্যাকাউন্ট সেটআপ করুন"** to claim the first admin account — the same
   first-run setup as the platform build.

**Environment variables (set in Vercel → Settings → Environment Variables):**

| Variable                  | Required | What it is |
| ------------------------- | -------- | ---------- |
| `DATABASE_URL`            | Yes      | Postgres connection string for the Supabase project above: `postgresql://postgres:<your-password>@db.veygdvejfgkjvsxeztsz.supabase.co:5432/postgres`, or the Transaction pooler URI (port 6543) from Supabase → Settings → Database. |
| `SUPABASE_URL`            | No       | `https://veygdvejfgkjvsxeztsz.supabase.co` — the project URL (public, not a secret). Reserved for future Supabase features; the app does not read it yet. |
| `SUPABASE_ANON_KEY`       | No       | The project's anon/public API key (Supabase → Settings → API). Reserved for future use; the app does not read it yet. |
| `SUPABASE_SERVICE_ROLE_KEY` | No     | The project's service-role API key (Supabase → Settings → API). **Secret** — reserved for future server-side use; the app does not read it yet. |

Only `DATABASE_URL` is needed for the app to run today. Set real values
only in Vercel's environment settings or a local `.env` file — never in
chat, code or this repository. Local development of the portable
edition: copy `portable/.env.example` to `portable/.env`, fill in
`DATABASE_URL`, then `bun install && bun run dev` inside `portable/`.

## Design system

| Token        | Value     |
| ------------ | --------- |
| Primary green | `#087A35` |
| Dark green    | `#064B27` |
| Accent orange | `#FF8A00` |
| Light green bg| `#F0FAF2` |
| Text dark     | `#202820` |
| Border        | `#E5EAE5` |

Mobile-first layout, rounded cards with subtle shadows.

## Notes

- No secrets, passwords, API keys or credentials are stored in this
  repository. The production database is **not** included.
- The binary image assets used by the deployed site (hero and service
  photos under `client/src/assets/`) are not part of this code push; the
  components reference them by import and render an icon treatment when an
  image is absent.
