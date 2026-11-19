// Optional manual migration runner: `npm run db:migrate` (or
// `bun run db:migrate`) with DATABASE_URL set applies the SQL files in
// `drizzle/` to the database. The app also applies them automatically on
// its first request, so this script is only needed if you prefer to set
// the database up ahead of time.

import { getDb } from "../server/src/db";

await getDb();
console.log("MistriDako database is ready (tables + seed data applied).");
process.exit(0);
