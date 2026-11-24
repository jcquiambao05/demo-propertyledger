// FR-01 / FR-02: Local-only authentication using NextAuth.js with a Credentials provider
// for the MFA step. Step 1 (password) happens on /login through the API; step 2 sends
// the MFA challenge token + TOTP code here. The API creates the Redis session; the JWT
// only carries its id.
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

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
  ],
  callbacks: {
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
    case "MANAGEMENT":
      return "/dashboard";
    case "LEGAL":
    case "TENANT":
      return "/map";
    case "IT_ADMIN":
      return "/admin/audit";
    default:
      return "/login";
  }
}
