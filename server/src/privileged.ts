// Host-side privileged handlers for the Muse artifact runtime.
//
// Action code (server/src/actions.ts and everything it imports) runs in
// a sandboxed worker that must not read host globals such as
// `process`. The one host capability the data-export gate needs —
// reading the EXPORT_TOKEN environment variable — lives here instead:
// the `exportData` action declares the `readExportToken` contract and
// calls it through `ctx.executePrivileged`, and this handler answers
// with the configured token (or null when it is unset). The token
// itself is never sent to any client; the action only compares it, in
// constant time, against the token the caller presented (see
// `export.ts`).

import {
  definePrivilegedContracts,
  definePrivilegedHandlers,
  z,
} from "@hatch/space-sdk";

export const Privileged = definePrivilegedContracts({
  readExportToken: {
    request: z.object({}),
    response: z.object({ token: z.string().nullable() }),
  },
});

export default definePrivilegedHandlers(Privileged, {
  async readExportToken() {
    return { token: process.env.EXPORT_TOKEN ?? null };
  },
});
