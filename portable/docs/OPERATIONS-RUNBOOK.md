# GhorSheba — Operations Runbook

Owner/operator procedures for the production site
(**https://ghorsheba-bd.vercel.app**). Written in Master Phase 12
(2026-11-19). Keep this file with the project; it contains no secrets —
only the names of environment variables and where they live.

## System map

| Piece | Where | Notes |
| --- | --- | --- |
| Web app + API | Vercel project (Root Directory `portable`) | Functions pinned to region **bom1 (Mumbai)** in `vercel.json` |
| Database | Supabase PostgreSQL, project ref `veygdvejfgkjvsxeztsz` (Mumbai, ap-south-1) | Reached only via `DATABASE_URL` (transaction pooler, port 6543) |
| Daily records sync | Google Sheet "GhorSheba Records" | Pulls `GET /api/export?token=…` once a day (cron job `ghorsheba-daily-sheets-sync`) |
| Full backup | Admin panel → Overview → "Full backup download" (Super Admin only) | Gzipped JSON of every table except live sessions |

## Environment variables (Vercel → Settings → Environment Variables)

| Variable | State | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **Set (required)** | Supabase pooler connection string. The site is down without it. |
| `EXPORT_TOKEN` | **Set** | Gates the read-only Sheets export endpoint. Long random value; treat like a password. |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWD` | **Absent — by design** | Gateway stays disabled until the owner buys sandbox credentials. Do NOT add live credentials: live mode costs ৳25,500 setup + 2.5%/transaction and is a separate, deliberate decision. |
| `SSLCOMMERZ_SANDBOX` | Absent | Only relevant once sandbox credentials exist. |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Not read by the app | Reserved names only. Never put the service-role key in any client code. |

Manual TrxID payment is the default and only live payment route.

## Incident procedures

### 1. Site is down / pages never load
1. Check Vercel → Deployments: is the latest deployment **Ready**? If a
   deploy failed, redeploy the last Ready commit (Deployments → … →
   Redeploy) — do not push new code during an outage.
2. Check Vercel → Logs for `/api/actions` errors. `DATABASE_URL is not
   set` or connection timeouts → check the env var still exists and the
   Supabase project is not paused (Supabase dashboard → project status;
   free projects pause after inactivity — restore it there).
3. Check Supabase → Database → health/pooler status. If the pooler is
   the problem, the direct connection string (port 5432) can be set as
   `DATABASE_URL` temporarily — change it back afterwards.
4. Post a notice: Admin → Announcements → send to **all** users once the
   site is back.

### 2. A payment is disputed
1. Admin → Bookings → open the booking → **Dispute** state freezes
   settlement: no payout for that booking can be released while it is
   disputed.
2. Check the payment record (Admin → Finance → Payments): provider,
   TrxID, verified-by, ledger entries. Never edit money by hand — every
   correction is a new ledger entry or a refund decision.
3. Decide with the customer and professional, then Admin → clear the
   dispute **with the reason written in the note** (mandatory).
4. If money must go back: the customer raises a refund request (or the
   admin handles it in Finance → Refunds) and a **finance** admin records
   the real refund amount + transfer reference. No percentage is
   automatic — the cancellation/refund policy pages govern the amount.

### 3. Data is wrong (wrong price, wrong status, wrong assignment)
1. Do not delete rows. Prices are fixed by a **new quotation** the
   customer approves; statuses move through the normal flow; every
   change is written to the booking history and the admin log.
2. If a record is truly corrupt, take a **Full backup download** first,
   then contact the developer with the booking code and this runbook.

### 4. Suspected account compromise
1. Admin → Customers/Professionals → **Suspend** the account (this kills
   its live sessions immediately).
2. Rotate the database password (procedure below) if the compromise
   could involve infrastructure, and change `EXPORT_TOKEN` in Vercel
   (then update the Sheets-sync task with the new token).
3. Review Admin → Activity Log for what the account touched.

### 5. A professional's identity documents are involved
NID photos live only in the `identity_documents` table and are viewable
only through Admin → Professionals → verification (operations/super
admins); every admin view is written to the activity log. They are never
served by any public URL. If a leak is suspected, suspend the account
and follow procedure 4.

## Backup & recovery

- **Daily**: the Google Sheet holds a field-filtered business snapshot
  (bookings, payments, professionals, reviews, ledger). It deliberately
  excludes password hashes, session tokens, NID data and document
  photos — it is a records sheet, not a restorable backup.
- **Restorable backup**: Admin → Overview → **Full backup download**
  (Super Admin). Contains every table except live sessions. Take one
  before any risky operation (including the test-data cleanup below)
  and store it in the owner's private Drive.
- **Platform backup**: Supabase dashboard → Database → Backups (daily
  on paid plans; on the free plan rely on the full-backup download).
- **Restore**: create a fresh Supabase project (or empty the database),
  point `DATABASE_URL` at it, let the app run its migrations on first
  request, then re-import the backup JSON table by table. Passwords in
  the backup are bcrypt hashes — users keep their passwords; live
  sessions are intentionally not restored (everyone logs in again).

## Database password rotation (OWNER ONLY — do not delegate)

The database password was pasted into a chat on 2026-11-16 and must be
rotated by the owner. **The Vercel `DATABASE_URL` must be updated in
the same sitting** — between the password change and the env update the
site cannot reach its database.

1. Open two tabs: Supabase dashboard and Vercel dashboard.
2. Supabase → Settings → Database → **Reset database password**. Set a
   new strong password and save it in a password manager — never in
   chat, never in this repo.
3. In the same Supabase page, copy the **Transaction pooler** connection
   string (port 6543) with the new password.
4. Vercel → Project → Settings → Environment Variables → edit
   `DATABASE_URL` (Production) → paste the new string → Save.
5. Vercel → Deployments → redeploy the latest deployment (env changes
   only apply to new deployments).
6. Open https://ghorsheba-bd.vercel.app and confirm services load and
   login works. Also confirm the Sheets export still works the next
   morning (it uses `EXPORT_TOKEN`, not the DB password — no change
   needed there).

## Test-data cleanup (prepared in Phase 12 — NOT yet executed)

Production contains these test accounts from the build phases:

| Account | Phone | Notes |
| --- | --- | --- |
| Test User | 01700000000 | Test customer (Phase: site go-live check) |
| "Hjjjh" | 01816590454 | Test customer; owns booking **GS-MWKUH175-F961** (also used in the owner's live dispute test) |
| "Vhh" | 01315443213 | Test professional (password unknown) |
| Test Pro | 01722222222 | Test professional with test-marked NID images |

Prepared script: `portable/scripts/cleanup-test-data.mjs`
(dry-run by default; prints every row it would delete; refuses to
delete a professional who is assigned to a real customer's booking;
deletes in one transaction only with `--execute --confirm=<phones>`).

**Before executing**: download a Full backup. **After executing**:
verify login as a real customer and the homepage counts. Deleting the
"Hjjjh" account also deletes booking GS-MWKUH175-F961 and its payment/
ledger history — that history is part of the dispute-test record; the
owner decides whether to keep it.

## Known open items (owner decisions, not bugs)

- **Commission collected reads ৳0.** No action writes a
  `commission_collected` ledger entry; commission is *earned*
  (`commission_due`) at verification and effectively collected when the
  held balance is settled at payout. The Finance UI labels this
  honestly. Changing the settlement model is a business decision.
- **No self-service password reset.** There is no email/SMS channel
  wired up, so a forgotten password is reset by an admin after identity
  verification (phone call). Adding OTP reset needs a messaging
  provider decision.
- **Export token travels in a URL** (the Sheets pull needs it). It is
  compared in constant time, wrong tokens get a plain 404, and the
  payload is field-filtered. Rotating it = change the Vercel env var +
  the sync task together.
- **SSLCOMMERZ validation call** includes the store password in a
  server-to-server HTTPS request body — that is the gateway's own API
  design; it never appears in the browser.

## Still needs the owner's phone (real-device checks)

- Admin panel on Android: sidebar drawer, bottom nav, Finance tables.
- Customer checkout end-to-end with a real confirmed booking (3 steps).
- Commission figures identical on phone vs desktop after a verify.
- PWA install prompt on Android Chrome + the PNG/PDF share sheet.
