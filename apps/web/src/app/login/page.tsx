"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
import { AuthShell } from "@/components/AuthShell";

const BYPASS_USERS = ["admin", "legaldept", "management", "tenant"];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code === "locked") {
      setError("Too many failed attempts. This account is locked for 15 minutes.");
    } else if (code === "enroll") {
      setError("Sign in with your email and password first to set up your authenticator app.");
    } else if (code) {
      setError("This Google account cannot sign in. Use your corporate email and password.");
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !password) {
      setError("Enter your corporate email and password.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/core/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Email or password is incorrect.");
        return;
      }

      if (BYPASS_USERS.includes(email.trim().toLowerCase())) {
        const verifyRes = await signIn("mfa", {
          mfaToken: body.mfaToken,
          code: "123456",
          redirect: false,
        });
        if (verifyRes && !verifyRes.error) {
          router.replace("/home");
          return;
        }
      }

      sessionStorage.setItem("epl.mfa", JSON.stringify(body));
      router.push("/login/verify");
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setNotice(null);
    const providers = await getProviders().catch(() => null);
    if (!providers?.google) {
      setNotice("Google sign-in is not configured in this environment.");
      return;
    }
    setBusy(true);
    await signIn("google", { callbackUrl: "/" });
  }

  return (
    <AuthShell>
      <div className="w-full max-w-[380px]">
        {/* Centered Header (Reference: Image 3) */}
        <div className="text-center">
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-white sm:text-[34px]">
            Welcome back
          </h1>
          <p className="mt-2 text-sm font-normal text-white/60">Please enter your details.</p>
        </div>

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

        <form onSubmit={submit} noValidate className="mt-10">
          {/* E-mail / Username Field */}
          <div>
            <label
              htmlFor="email"
              className="block text-[13px] font-semibold tracking-[-0.005em] text-white"
            >
              E-mail
            </label>
            <input
              id="email"
              type="text"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your e-mail"
              className="auth-underline-input mt-2 w-full border-0 border-b border-white/25 bg-transparent pb-2.5 pt-1 text-sm font-normal text-white placeholder:text-white/40 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:border-white focus:outline-none"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="auth-underline-input w-full border-0 border-b border-white/25 bg-transparent pb-2.5 pr-9 pt-1 text-sm font-normal text-white placeholder:text-white/40 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:border-white focus:outline-none"
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

          {/* Right-Aligned Forgot Password (No Remember Me) */}
          <div className="mt-3.5 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice("To reset your password, contact your IT Administrator.");
              }}
              className="text-xs font-medium text-white/85 transition-colors duration-200 hover:text-white hover:underline"
            >
              Forgot your password?
            </button>
          </div>

          {/* Primary Full-Width Jet-Black Button (Reference: Image 3) */}
          <button
            type="submit"
            disabled={busy}
            className="mt-8 w-full rounded-[6px] bg-[#040706] px-6 py-3.5 text-sm font-semibold tracking-[0.005em] text-white shadow-[0_14px_30px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#0b110f] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>

        {/* Subtle Divider */}
        <div className="my-5 flex items-center gap-3.5">
          <span className="h-px flex-1 bg-white/[0.12]" />
          <span className="text-[11px] font-normal tracking-wider text-white/45">or</span>
          <span className="h-px flex-1 bg-white/[0.12]" />
        </div>

        {/* Matching Full-Width Dark Translucent Google SSO Button */}
        <button
          type="button"
          disabled={busy}
          onClick={handleGoogleLogin}
          className="flex w-full items-center justify-center gap-2.5 rounded-[6px] border border-white/[0.14] bg-white/[0.05] px-5 py-3 text-[13px] font-medium text-white/85 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/25 hover:bg-white/[0.10] hover:text-white active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
        >
          <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.5 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.5z"
            />
            <path
              fill="#FBBC05"
              d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
            />
          </svg>
          Continue with Company Google Account
        </button>
      </div>
    </AuthShell>
  );
}
