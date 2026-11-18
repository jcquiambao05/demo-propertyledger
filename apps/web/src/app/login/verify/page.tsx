"use client";
// Figure 9 (V02 MFA) and Figure 10 (V03 MFA setup at first sign-in). FR-02.
// Design copied from the demo prototype; the code is checked by the API through NextAuth.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { APP_NAME, ORG_NAME } from "@/lib/branding";

interface Challenge {
  mfaToken: string;
  mfaSetup: { secret: string; otpauthUrl: string } | null;
}

export default function VerifyPage() {
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const raw = sessionStorage.getItem("epl.mfa");
    if (!raw) {
      router.replace("/login");
      return;
    }
    setChallenge(JSON.parse(raw) as Challenge);
  }, [router]);

  async function verify(code: string) {
    if (!challenge || busy) return;
    setBusy(true);
    setError(null);
    const res = await signIn("mfa", { mfaToken: challenge.mfaToken, code, redirect: false });
    setBusy(false);
    if (!res || res.error) {
      setError("That code is not correct or has expired. Check the code and try again.");
      setDigits(Array(6).fill(""));
      refs.current[0]?.focus();
      return;
    }
    sessionStorage.removeItem("epl.mfa");
    router.replace("/home");
  }

  function setAt(i: number, v: string) {
    const d = v.replace(/\D/g, "");
    if (!d) return;
    // A paste or autofill can carry all six digits.
    const next = [...digits];
    d.slice(0, 6 - i)
      .split("")
      .forEach((c, k) => (next[i + k] = c));
    setDigits(next);
    setError(null);
    const last = Math.min(i + d.length, 5);
    refs.current[last]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      const next = [...digits];
      if (next[i]) next[i] = "";
      else if (i > 0) {
        next[i - 1] = "";
        refs.current[i - 1]?.focus();
      }
      setDigits(next);
    }
  }

  if (!challenge) return null;
  const setup = challenge.mfaSetup;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            EP
          </span>
          <p className="text-sm font-semibold">{APP_NAME}</p>
        </div>
        <h1 className="mt-6 text-2xl font-bold">
          {setup ? "Set up your authenticator app" : "Enter your verification code"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {setup
            ? "Add this account to your authenticator app with the setup key below, then type the 6-digit code."
            : "Open your authenticator app and type the 6-digit code."}
        </p>

        {setup && (
          <div className="mt-4 rounded-md bg-page px-3 py-2">
            <p className="text-xs text-muted">Setup key (shown once, do not share)</p>
            <p className="mt-1 break-all font-mono text-sm">{setup.secret}</p>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2" role="group" aria-label="6-digit code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={d}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${i + 1}`}
              maxLength={6}
              autoFocus={i === 0}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              className="h-12 w-12 rounded-md border border-line bg-surface text-center text-lg font-semibold focus:border-brand focus:outline-none"
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-4 rounded-md bg-page px-3 py-2 text-sm text-ink">
            {notice}
          </p>
        )}

        <button
          type="button"
          onClick={() => void verify(digits.join(""))}
          disabled={!digits.every(Boolean) || busy}
          className="mt-6 w-full rounded-md bg-brand px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Checking…" : "Verify"}
        </button>
        <button
          type="button"
          onClick={() => setNotice("Email codes are not available yet. Use your authenticator app.")}
          className="mt-3 text-sm font-medium text-brand"
        >
          Send a code to my email instead
        </button>
        <button type="button" onClick={() => router.replace("/login")} className="mt-3 block text-sm text-muted">
          Back to sign in
        </button>
      </div>
      <p className="mt-6 text-xs text-muted">© 2026 {ORG_NAME}. For internal use only.</p>
    </div>
  );
}
