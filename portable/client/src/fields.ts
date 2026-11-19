// Portable edition stand-in for the artifact's schema-derived field
// props: the Vercel build has no @hatch/space-sdk macro, so FIELDS
// resolves to empty prop objects and inputs render exactly as before.
// Every limit is still enforced server-side by the action request
// schemas (identical in both editions), so nothing is left unchecked.
// Typed as `any` deliberately: it is a transparent no-op proxy whose
// only job is to let the shared client code spread it harmlessly.
const fields: unknown = new Proxy(
  {},
  {
    get: () => fields,
  },
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FIELDS: any = fields;
