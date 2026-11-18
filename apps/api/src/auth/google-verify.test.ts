// FR-01: the API accepts a Google ID token only for this app's client id, from Google,
// with a verified email, before expiry. Google's tokeninfo endpoint is stubbed (no network).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { verifyGoogleIdToken } from "./google.js";

const CLIENT = "test-client.apps.googleusercontent.com";
const future = String(Math.floor(Date.now() / 1000) + 600);
const good = {
  aud: CLIENT,
  iss: "https://accounts.google.com",
  email: "a@b.example",
  email_verified: "true",
  exp: future,
};

function stub(body: object, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => body }));
}

beforeEach(() => vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("verifyGoogleIdToken", () => {
  it("returns the email for a valid token", async () => {
    stub(good);
    expect(await verifyGoogleIdToken("t")).toEqual({ email: "a@b.example" });
  });

  it.each([
    ["another app's client id", { ...good, aud: "other" }],
    ["a non-Google issuer", { ...good, iss: "https://evil.example" }],
    ["an unverified email", { ...good, email_verified: "false" }],
    ["an expired token", { ...good, exp: "1" }],
    ["no email", { ...good, email: undefined }],
  ])("rejects %s", async (_label, body) => {
    stub(body);
    expect(await verifyGoogleIdToken("t")).toBeNull();
  });

  it("rejects when Google refuses the token", async () => {
    stub({}, false);
    expect(await verifyGoogleIdToken("t")).toBeNull();
  });

  it("rejects everything when GOOGLE_CLIENT_ID is not set, without calling Google", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    stub(good);
    expect(await verifyGoogleIdToken("t")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
