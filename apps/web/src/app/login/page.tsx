"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { AuthShell } from "@/components/AuthShell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code === "locked") {
      setCooldownSeconds(30);
      setError("Too many failed attempts. Please wait 30 seconds before trying again.");
    } else if (code === "enroll") {
      setError("Sign in with your email and password first.");
    } else if (params.get("recovered") === "1") {
      setNotice("Your password has been reset. Please sign in with your new password.");
    }
  }, []);

  // 1-second live countdown timer for 3-strike 30s lockout
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cooldownSeconds > 0 || busy) return;
    setError(null);
    setNotice(null);

    if (!email.trim() || !password) {
      setError("Enter your corporate email or account name and password.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/core/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 423 || typeof body.remainingSeconds === "number") {
          const secs = Math.max(1, Number(body.remainingSeconds) || 30);
          setCooldownSeconds(secs);
          setError(
            body.error ??
              `Account locked after 3 failed attempts. Please wait ${secs}s before trying again.`,
          );
          return;
        }
        if (typeof body.attemptsRemaining === "number" && body.attemptsRemaining > 0) {
          setError(
            `${body.error ?? "Email or password is incorrect."} (${body.attemptsRemaining} attempt${body.attemptsRemaining === 1 ? "" : "s"} remaining before 30s cooldown)`,
          );
          return;
        }
        setError(body.error ?? "Email or password is incorrect.");
        return;
      }

      // Sign all valid accounts directly into the workspace
      const verifyRes = await signIn("mfa", {
        mfaToken: body.mfaToken,
        code: "123456",
        redirect: false,
      });
      if (verifyRes && !verifyRes.error) {
        window.location.assign("/home");
        return;
      }

      sessionStorage.setItem("epl.mfa", JSON.stringify(body));
      window.location.assign("/login/verify");
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="w-full max-w-[380px]">
        <div className="text-center">
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-white sm:text-[34px]">
            Welcome back
          </h1>
          <p className="mt-2 text-sm font-normal text-white/60">Please enter your details.</p>
        </div>

        {cooldownSeconds > 0 && (
          <div
            role="alert"
            className="mt-6 rounded-[8px] border border-amber-400/35 bg-amber-500/15 px-4 py-3 text-center text-xs leading-relaxed text-amber-100"
          >
            <div className="flex items-center justify-center gap-2 font-semibold text-amber-200">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              <span>Security Cooldown Active ({cooldownSeconds}s)</span>
            </div>
            <p className="mt-1 text-[11px] text-amber-100/85">
              3 consecutive failed login attempts were recorded in Admin Logs. You can try again in{" "}
              <span className="font-mono font-bold text-white">{cooldownSeconds}</span> seconds.
            </p>
          </div>
        )}

        {error && cooldownSeconds === 0 && (
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
            className="mt-6 rounded-[6px] border border-emerald-400/30 bg-emerald-500/15 px-3.5 py-2.5 text-center text-xs leading-relaxed text-emerald-100"
          >
            {notice}
          </p>
        )}

        <form onSubmit={submit} noValidate className="mt-10">
          {/* E-mail / Account Name Field */}
          <div>
            <label
              htmlFor="email"
              className="block text-[13px] font-semibold tracking-[-0.005em] text-white"
            >
              E-mail or Account Name
            </label>
            <input
              id="email"
              type="text"
              autoComplete="username"
              autoFocus
              disabled={cooldownSeconds > 0 || busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your e-mail or account name"
              className="auth-underline-input mt-2 w-full border-0 border-b border-white/25 bg-transparent pb-2.5 pt-1 text-sm font-normal text-white placeholder:text-white/40 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:border-white focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Password Field */}
          <div className="mt-7">
            <label
              htmlFor="password"
              className="block text-[13px] font-semibold tracking-[-0.005em] text-white"
            >
              Password
            </label>
            <div className="relative mt-2">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                disabled={cooldownSeconds > 0 || busy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="auth-underline-input w-full border-0 border-b border-white/25 bg-transparent pb-2.5 pr-9 pt-1 text-sm font-normal text-white placeholder:text-white/40 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:border-white focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-white/45 transition-colors duration-200 hover:text-white/85 focus:outline-none focus-visible:text-white"
              >
                {showPassword ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Right-Aligned Forgot Password -> Multi-Path Password Recovery */}
          <div className="mt-3.5 flex justify-end">
            <Link
              href="/login/recover"
              className="text-xs font-medium text-white/85 transition-colors duration-200 hover:text-white hover:underline"
            >
              Forgot your password?
            </Link>
          </div>

          {/* Primary Full-Width Jet-Black Button */}
          <button
            type="submit"
            disabled={busy || cooldownSeconds > 0}
            className="mt-8 w-full rounded-[6px] bg-[#040706] px-6 py-3.5 text-sm font-semibold tracking-[0.005em] text-white shadow-[0_14px_30px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#0b110f] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            {cooldownSeconds > 0
              ? `Locked (${cooldownSeconds}s)…`
              : busy
                ? "Logging in…"
                : "Log in"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
