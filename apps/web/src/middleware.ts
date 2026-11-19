// Pages need a NextAuth session. This is convenience only: every API route enforces
// RBAC on the server, so hiding a page here is never the protection (FR-03).
export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/((?!login|api|_next|brand|favicon.ico|$).*)"],
};
