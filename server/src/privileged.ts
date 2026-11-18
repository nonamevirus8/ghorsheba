// Host-side privileged handlers for the Muse artifact runtime.
//
// Action code (server/src/actions.ts and everything it imports) runs in
// a sandboxed worker that must not read host globals such as
// `process`. The host capabilities that need environment variables —
// reading the EXPORT_TOKEN for the data-export gate, and the
// SSLCOMMERZ sandbox credentials for the Phase 8 gateway layer — live
// here instead: the actions declare these contracts and call them
// through `ctx.executePrivileged`. The values are never sent to any
// client; the export token is only compared (in constant time) against
// the token the caller presented (see `export.ts`), and the gateway
// credentials are only used server-side to talk to the SSLCOMMERZ
// sandbox (see `sslcommerz.ts`).

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
  readSslcommerzConfig: {
    request: z.object({}),
    response: z.object({
      storeId: z.string().nullable(),
      storePassword: z.string().nullable(),
      sandbox: z.string().nullable(),
    }),
  },
});

export default definePrivilegedHandlers(Privileged, {
  async readExportToken() {
    return { token: process.env.EXPORT_TOKEN ?? null };
  },
  async readSslcommerzConfig() {
    return {
      storeId: process.env.SSLCOMMERZ_STORE_ID ?? null,
      storePassword: process.env.SSLCOMMERZ_STORE_PASSWD ?? null,
      sandbox: process.env.SSLCOMMERZ_SANDBOX ?? null,
    };
  },
});
