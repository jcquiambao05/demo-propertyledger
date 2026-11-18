// FR-01: Google Workspace SSO. The API checks the Google ID token itself instead of
// trusting the web app, so a direct call to /auth/google cannot claim any email.
// Uses Google's tokeninfo endpoint (no extra package); it validates signature and expiry.

const TOKENINFO = "https://oauth2.googleapis.com/tokeninfo";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

interface TokenInfo {
  aud?: string;
  iss?: string;
  email?: string;
  email_verified?: string | boolean;
  exp?: string;
}

/** Returns the verified email, or null when Google does not accept the token for this app. */
export async function verifyGoogleIdToken(idToken: string): Promise<{ email: string } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  const res = await fetch(`${TOKENINFO}?id_token=${encodeURIComponent(idToken)}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const info = (await res.json()) as TokenInfo;
  const verified = info.email_verified === true || info.email_verified === "true";
  const notExpired = Number(info.exp) * 1000 > Date.now();
  if (info.aud !== clientId || !ISSUERS.has(info.iss ?? "") || !verified || !notExpired)
    return null;
  if (!info.email) return null;
  return { email: info.email };
}
