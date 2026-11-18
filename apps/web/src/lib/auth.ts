// FR-01 / FR-02: NextAuth.js with a Credentials provider for the MFA step.
// Step 1 (password) happens on /login through the API; step 2 sends the MFA challenge
// token + TOTP code here. The API creates the Redis session; the JWT only carries its id.
// Google Workspace SSO is a second step-1 option; it still ends in the same TOTP step.
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

export type Role = "LEGAL" | "MANAGEMENT" | "TENANT" | "IT_ADMIN";

export const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      id: "mfa",
      name: "Verification code",
      credentials: { mfaToken: { type: "text" }, code: { type: "text" } },
      async authorize(credentials) {
        if (!credentials?.mfaToken || !credentials.code) return null;
        const res = await fetch(`${API_URL}/auth/mfa/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mfaToken: credentials.mfaToken, code: credentials.code }),
          cache: "no-store",
        });
        if (!res.ok) return null;
        const body = (await res.json()) as {
          sid: string;
          user: { id: string; name: string; role: Role };
        };
        return { id: body.user.id, name: body.user.name, role: body.user.role, sid: body.sid };
      },
    }),
    // FR-01 Google Workspace SSO. Registered only when both env vars are set.
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    // Google never creates a session here. The API checks the ID token and the email
    // allow-list, and returns a single-use handoff; returning a URL aborts this sign-in and
    // sends the browser to the normal TOTP step, which creates the session (FR-02).
    async signIn({ account }) {
      if (account?.provider !== "google") return true;
      if (!account.id_token) return "/login?error=google";
      try {
        const res = await fetch(`${API_URL}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: account.id_token }),
          cache: "no-store",
        });
        if (res.status === 423) return "/login?error=locked";
        if (res.status === 403) return "/login?error=enroll";
        if (!res.ok) return "/login?error=google";
        const { handoff } = (await res.json()) as { handoff: string };
        return `/login/google?h=${encodeURIComponent(handoff)}`;
      } catch {
        return "/login?error=google";
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.sid = user.sid;
        token.role = user.role;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      // The session id stays inside the encrypted JWT; the browser session object never sees it.
      session.user = { name: token.name ?? "", role: token.role as Role };
      return session;
    },
  },
};

export function homeFor(role: Role | undefined): string {
  switch (role) {
    case "LEGAL":
      return "/properties";
    case "MANAGEMENT":
      return "/approvals";
    case "TENANT":
      return "/map";
    case "IT_ADMIN":
      return "/admin/audit";
    default:
      return "/login";
  }
}
