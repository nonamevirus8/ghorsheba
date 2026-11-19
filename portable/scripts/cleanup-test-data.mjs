#!/usr/bin/env node
// MistriDako — production test-data cleanup (Master Phase 12, PREPARED ONLY).
//
// Identifies the known TEST accounts created during the phased build &
// live verification and reports — or, only with explicit flags, deletes —
// every row that belongs to them, in foreign-key-safe order.
//
// DEFAULT MODE IS A DRY RUN: it only SELECTs and prints the exact list.
// Nothing is deleted unless BOTH flags are given:
//
//   DATABASE_URL=... node scripts/cleanup-test-data.mjs                → dry run
//   DATABASE_URL=... node scripts/cleanup-test-data.mjs --execute \
//       --confirm=01700000000,01816590454,01315443213,01722222222       → delete
//
// The --confirm list must repeat the phone numbers, so a stray --execute
// can never delete anything by itself. Deletion runs in ONE transaction;
// any failure rolls everything back.
//
// SAFETY: if a test professional is assigned to a booking whose customer
// is NOT itself a test account, that professional is reported as a
// BLOCKER and skipped — a real customer's booking is never deleted to
// remove a test account. Financial rows (payments / payment_ledger) of
// test-customer bookings are listed explicitly in the report because
// deleting them erases financial history; the owner should take a full
// backup (Admin → Full backup download) before executing.
//
// Override the phone list with TEST_PHONES=comma,separated,numbers.

import postgres from "postgres";

const DEFAULT_PHONES = ["01700000000", "01816590454", "01315443213", "01722222222"];
const phones = (process.env.TEST_PHONES ?? DEFAULT_PHONES.join(","))
  .split(",").map((s) => s.trim()).filter(Boolean);
const execute = process.argv.includes("--execute");
const confirmArg = process.argv.find((a) => a.startsWith("--confirm="))?.slice("--confirm=".length) ?? "";
const confirmPhones = confirmArg.split(",").map((s) => s.trim()).filter(Boolean);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — nothing to do.");
  process.exit(2);
}
if (execute && JSON.stringify([...confirmPhones].sort()) !== JSON.stringify([...phones].sort())) {
  console.error("--execute requires --confirm to repeat the exact phone list. Aborting; nothing deleted.");
  process.exit(2);
}

const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  const users = await sql`select id, name, phone, role from users where phone in ${sql(phones)} order by id`;
  console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN (no changes will be made)"}`);
  console.log(`Test phones: ${phones.join(", ")}`);
  console.log(`\n== Test accounts found: ${users.length} ==`);
  for (const u of users) console.log(`  user #${u.id}  ${u.name}  ${u.phone}  role=${u.role}`);
  const missing = phones.filter((p) => !users.some((u) => u.phone === p));
  for (const p of missing) console.log(`  (no account found for ${p} — already gone or never registered)`);

  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) { console.log("\nNothing to clean up."); return; }

  const pros = await sql`select id, user_id from professionals where user_id in ${sql(userIds)}`;
  const proIds = pros.map((p) => p.id);

  // Bookings owned by the test customers.
  const ownBookings = await sql`select id, code, status, final_price from bookings where customer_id in ${sql(userIds)} order by id`;
  const ownBookingIds = ownBookings.map((b) => b.id);
  // BLOCKERS: bookings of REAL customers assigned to a test professional.
  const foreignBookings = proIds.length
    ? await sql`select id, code, customer_id from bookings where professional_id in ${sql(proIds)} and customer_id not in ${sql(userIds)}`
    : [];
  const blockedProIds = new Set(foreignBookings.map((b) => b.professional_id));
  const blockedUserIds = new Set(pros.filter((p) => blockedProIds.has(p.id)).map((p) => p.user_id));

  const count = async (label, query) => {
    const rows = await query;
    if (rows.length) console.log(`  ${label}: ${rows.length} row(s) — ${rows.map((r) => r.ref).join(", ")}`);
    return rows.length;
  };

  console.log(`\n== Rows belonging to these accounts ==`);
  let total = 0;
  if (ownBookingIds.length) {
    console.log(`Bookings (as customer): ${ownBookings.map((b) => `${b.code} [${b.status}${b.final_price ? ` ৳${b.final_price}` : ""}]`).join(", ")}`);
    total += await count("booking_events", sql`select id::text as ref from booking_events where booking_id in ${sql(ownBookingIds)}`);
    total += await count("payments (FINANCIAL HISTORY)", sql`select id::text as ref from payments where booking_id in ${sql(ownBookingIds)}`);
    total += await count("payment_ledger (FINANCIAL HISTORY)", sql`select id::text as ref from payment_ledger where booking_id in ${sql(ownBookingIds)}`);
    total += await count("quotations", sql`select id::text as ref from quotations where booking_id in ${sql(ownBookingIds)}`);
    total += await count("reviews", sql`select id::text as ref from reviews where booking_id in ${sql(ownBookingIds)}`);
    total += await count("cancel_requests", sql`select id::text as ref from cancel_requests where booking_id in ${sql(ownBookingIds)}`);
    total += await count("refund_requests", sql`select id::text as ref from refund_requests where booking_id in ${sql(ownBookingIds)}`);
    total += await count("coupon_redemptions", sql`select id::text as ref from coupon_redemptions where booking_id in ${sql(ownBookingIds)}`);
    total += await count("withdrawal_requests (booking-linked)", sql`select id::text as ref from withdrawal_requests where booking_id in ${sql(ownBookingIds)}`);
    total += await count("notifications (booking-linked)", sql`select id::text as ref from notifications where booking_id in ${sql(ownBookingIds)}`);
  }
  if (proIds.length) {
    total += await count("identity_documents (NID photos)", sql`select (professional_id || ':' || kind) as ref from identity_documents where professional_id in ${sql(proIds)}`);
    total += await count("withdrawal_requests (professional)", sql`select id::text as ref from withdrawal_requests where professional_id in ${sql(proIds)}`);
    total += await count("reviews (as professional)", sql`select id::text as ref from reviews where professional_id in ${sql(proIds)}`);
  }
  const ticketIds = (await sql`select id from support_tickets where user_id in ${sql(userIds)}`).map((t) => t.id);
  if (ticketIds.length) {
    total += await count("support_ticket_messages", sql`select id::text as ref from support_ticket_messages where ticket_id in ${sql(ticketIds)}`);
    console.log(`  support_tickets: ${ticketIds.length} row(s)`);
    total += ticketIds.length;
  }
  total += await count("complaints", sql`select id::text as ref from complaints where customer_id in ${sql(userIds)}`);
  total += await count("addresses", sql`select id::text as ref from addresses where user_id in ${sql(userIds)}`);
  total += await count("notifications (user)", sql`select id::text as ref from notifications where user_id in ${sql(userIds)}`);
  total += await count("sessions", sql`select left(token, 8) as ref from sessions where user_id in ${sql(userIds)}`);
  total += await count("account_deletion_requests", sql`select id::text as ref from account_deletion_requests where user_id in ${sql(userIds)}`);
  total += await count("auth_attempts (by phone)", sql`select (scope || ':' || key) as ref from auth_attempts where key in ${sql(phones)}`);
  total += await count("announcements (authored by these accounts)", sql`select id::text as ref from announcements where admin_id in ${sql(userIds)}`);
  const logRefs = (await sql`select count(*)::int as c from admin_logs where admin_id in ${sql(userIds)}`)[0].c;
  if (logRefs) console.log(`  admin_logs references: ${logRefs} row(s) — KEPT (audit trail); only the admin_id link is cleared`);
  console.log(`  professionals rows: ${pros.length}, users rows: ${users.length}`);
  total += pros.length + users.length;

  if (foreignBookings.length) {
    console.log(`\n== BLOCKERS (will be SKIPPED) ==`);
    for (const b of foreignBookings) {
      const pro = pros.find((p) => p.id === b.professional_id);
      const owner = users.find((u) => u.id === pro?.user_id);
      console.log(`  professional ${owner?.name} (${owner?.phone}) is assigned to REAL booking ${b.code} (customer #${b.customer_id}) — account kept.`);
    }
  }
  console.log(`\nTotal rows that ${execute ? "WILL BE" : "WOULD BE"} deleted: ${total} (excluding ${blockedUserIds.size} blocked account(s))`);

  if (!execute) {
    console.log("\nDry run only — nothing was deleted. To execute, the owner re-runs with --execute --confirm=<the same phone list>, after taking a full backup.");
    return;
  }

  const deletableUserIds = userIds.filter((id) => !blockedUserIds.has(id));
  const deletableProIds = pros.filter((p) => !blockedProIds.has(p.id)).map((p) => p.id);
  await sql.begin(async (tx) => {
    if (ownBookingIds.length) {
      await tx`delete from booking_events where booking_id in ${tx(ownBookingIds)}`;
      await tx`delete from payment_ledger where booking_id in ${tx(ownBookingIds)}`;
      await tx`delete from payments where booking_id in ${tx(ownBookingIds)}`;
      await tx`delete from quotations where booking_id in ${tx(ownBookingIds)}`;
      await tx`delete from reviews where booking_id in ${tx(ownBookingIds)}`;
      await tx`delete from cancel_requests where booking_id in ${tx(ownBookingIds)}`;
      await tx`delete from refund_requests where booking_id in ${tx(ownBookingIds)}`;
      await tx`delete from coupon_redemptions where booking_id in ${tx(ownBookingIds)}`;
      await tx`delete from withdrawal_requests where booking_id in ${tx(ownBookingIds)}`;
      await tx`delete from notifications where booking_id in ${tx(ownBookingIds)}`;
      await tx`delete from bookings where id in ${tx(ownBookingIds)}`;
    }
    if (ticketIds.length) {
      await tx`delete from support_ticket_messages where ticket_id in ${tx(ticketIds)}`;
      await tx`delete from support_tickets where id in ${tx(ticketIds)}`;
    }
    if (deletableProIds.length) {
      await tx`delete from identity_documents where professional_id in ${tx(deletableProIds)}`;
      await tx`delete from withdrawal_requests where professional_id in ${tx(deletableProIds)}`;
      await tx`delete from reviews where professional_id in ${tx(deletableProIds)}`;
      await tx`delete from professionals where id in ${tx(deletableProIds)}`;
    }
    await tx`delete from complaints where customer_id in ${tx(deletableUserIds)}`;
    await tx`delete from addresses where user_id in ${tx(deletableUserIds)}`;
    await tx`delete from notifications where user_id in ${tx(deletableUserIds)}`;
    await tx`delete from sessions where user_id in ${tx(deletableUserIds)}`;
    await tx`delete from account_deletion_requests where user_id in ${tx(deletableUserIds)}`;
    await tx`delete from announcements where audience_user_id in ${tx(deletableUserIds)}`;
    await tx`delete from announcements where admin_id in ${tx(deletableUserIds)}`;
    // References from rows that must SURVIVE (other people's records the
    // test account merely touched): clear the nullable link, keep the row.
    await tx`update admin_logs set admin_id = null where admin_id in ${tx(deletableUserIds)}`;
    await tx`update payments set verified_by = null where verified_by in ${tx(deletableUserIds)}`;
    await tx`update withdrawal_requests set admin_id = null where admin_id in ${tx(deletableUserIds)}`;
    await tx`update refund_requests set decided_by = null where decided_by in ${tx(deletableUserIds)}`;
    await tx`update cancel_requests set decided_by = null where decided_by in ${tx(deletableUserIds)}`;
    await tx`delete from auth_attempts where key in ${tx(phones)}`;
    await tx`delete from users where id in ${tx(deletableUserIds)}`;
  });
  console.log("Deletion committed in one transaction.");
}

main()
  .catch((e) => { console.error("FAILED:", e.message); process.exitCode = 1; })
  .finally(() => sql.end());
