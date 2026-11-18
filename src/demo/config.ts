// Demo config. Defaults per docs/demo/DEMO_PAGES.md §0. Demo only: no backend.
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME ?? process.env.APP_NAME ?? "Eagle Property Ledger";
export const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME ?? "X Cement Corporation";
