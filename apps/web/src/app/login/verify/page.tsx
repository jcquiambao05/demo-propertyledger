"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AuthShell } from "@/components/AuthShell";

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
      setError("That code is incorrect or has expired. Try again.");
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
    <AuthShell>
      <div className="w-full max-w-[380px]">
        <div className="text-center">
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-white sm:text-[34px]">
            {setup ? "Authenticator setup" : "Verification"}
          </h1>
          <p className="mt-2 text-sm font-normal text-white/60">
            {setup
              ? "Add the setup key below, then enter the 6-digit code."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>

        {setup && (
          <div className="mt-7 rounded-[6px] border border-white/[0.12] bg-white/[0.05] px-4 py-3">
            <p className="text-[11px] font-medium tracking-[0.02em] text-white/55">
              Setup key (shown once)
            </p>
            <p className="mt-1.5 break-all font-mono text-xs tracking-wider text-white/95">
              {setup.secret}
            </p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-[6px] border border-red-400/25 bg-red-500/10 px-3.5 py-2.5 text-center text-xs leading-relaxed text-red-100"
          >
            {error}
          </p>
        )}

        {notice && (
          <p
            role="status"
            className="mt-6 rounded-[6px] border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-center text-xs leading-relaxed text-white/85"
          >
            {notice}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify(digits.join(""));
          }}
          className="mt-10"
        >
          <div className="grid grid-cols-6 gap-3" role="group" aria-label="6-digit verification code">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoFocus={i === 0}
                value={d}
                onChange={(e) => setAt(i, e.target.value)}
                onKeyDown={(e) => onKey(i, e)}
                aria-label={`Digit ${i + 1}`}
                className="h-12 w-full border-0 border-b border-white/30 bg-transparent text-center font-mono text-xl font-normal tabular-nums text-white transition-colors duration-200 focus:border-white focus:outline-none"
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={busy || digits.some((d) => !d)}
            className="mt-8 w-full rounded-[6px] bg-[#040706] px-6 py-3.5 text-sm font-semibold tracking-[0.005em] text-white shadow-[0_14px_30px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#0b110f] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45"
          >
            {busy ? "Verifying…" : "Verify"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem("epl.mfa");
              router.replace("/login");
            }}
            className="font-normal text-white/65 transition-colors duration-200 hover:text-white"
          >
            Back to sign in
          </button>
          <button
            type="button"
            onClick={() =>
              setNotice("If you lost access to your authenticator app, contact your IT Administrator.")
            }
            className="font-medium text-white/80 transition-colors duration-200 hover:text-white hover:underline"
          >
            Need help?
          </button>
        </div>
      </div>
    </AuthShell>
  );
}
