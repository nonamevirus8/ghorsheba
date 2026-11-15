// Typed RPC client. Types come straight from `server/src/actions.ts` — no
// codegen. `createActionClient` (from `./space-client`, the portable
// stand-in for the Muse platform SDK) returns a proxy that POSTs
// `{ action, args }` to `/api/actions` and returns the typed response.
//
// `import type { Actions }` is type-only by design: the client bundle never
// pulls in any server runtime. With `verbatimModuleSyntax: true`, dropping
// `type` is a compile error.

import type { Actions } from "../../server/src/actions";
import { createActionClient } from "./space-client";

export const api = createActionClient<typeof Actions>();

// Re-exported for convenience so client code can do
//
//     import { api, type ApiResponse } from "./api";
//     type Article = ApiResponse<typeof api, "listArticles">["articles"][number];
export type { ApiRequest, ApiResponse } from "./space-client";
