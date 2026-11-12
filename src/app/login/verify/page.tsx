"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_NAME, ORG_NAME } from "@/demo/config";
import { ROLE_HOME, useRole } from "@/demo/role";

export default function VerifyPage() {
  const router = useRouter();
  const { role } = useRole();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [byEmail, setByEmail] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function verify(code: string) {
    if (code === "000000") {
      setError("That code is not correct. Check the code and try again.");
      setDigits(Array(6).fill(""));
      refs.current[0]?.focus();
      return;
    }
    router.push(ROLE_HOME[role]);
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
    if (next.every(Boolean)) verify(next.join(""));
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

  return (
    <div className="flex min-h-[calc(100vh-1.75rem)] flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            EP
          </span>
          <p className="text-sm font-semibold">{APP_NAME}</p>
        </div>
        <h1 className="mt-6 text-2xl font-bold">Enter your verification code</h1>
        <p className="mt-1 text-sm text-muted">
          {byEmail
            ? "We sent a 6-digit code to your corporate email (demo: no email is sent)."
            : "Open your authenticator app and type the 6-digit code."}
        </p>

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
              className="h-12 w-12 rounded-md border border-line bg-surface text-center text-lg font-semibold focus:border-brand"
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => verify(digits.join(""))}
          disabled={!digits.every(Boolean)}
          className="mt-6 w-full rounded-md bg-brand px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Verify
        </button>
        <button
          type="button"
          onClick={() => setByEmail(true)}
          className="mt-3 text-sm font-medium text-brand"
        >
          Send a code to my email instead
        </button>
      </div>
      <p className="mt-6 text-xs text-muted">© 2026 {ORG_NAME}. For internal use only.</p>
    </div>
  );
}
