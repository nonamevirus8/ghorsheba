// Schema-derived form input props (platform v29): every form input
// that feeds a limited request field spreads its FIELDS entry, so the
// input's maxLength / min / max / required always match the server
// action's own request schema and the two can never disagree.
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";

export const FIELDS = actionFields<typeof Actions>();
