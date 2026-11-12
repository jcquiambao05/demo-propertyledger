"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APP_NAME, ORG_NAME } from "@/demo/config";
import { roleFromEmail, useRole } from "@/demo/role";

const FEATURES = [
  {
    title: "Interactive Philippines map",
    text: "See every approved parcel by region, province, and compliance status.",
  },
  {
    title: "Verified document repository",
    text: "SHA-256 integrity checks and custody tracking for every land document.",
  },
  {
    title: "Due date alerts",
    text: "Email reminders before real property tax due dates and document expiry.",
  },
];

const FIELD =
  "mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-brand";

export default function LoginPage() {
  const router = useRouter();
  const { setRole } = useRole();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password === "locked") {
      setError("This account is locked after 5 failed attempts. Try again in 15 minutes.");
      return;
    }
    if (password === "wrong") {
      setError("Email or password is incorrect.");
      return;
    }
    setRole(roleFromEmail(email));
    router.push("/login/verify");
  }

  return (
    <div className="flex min-h-[calc(100vh-1.75rem)] flex-col items-center justify-center px-4 py-8">
      <div className="grid w-full max-w-[1100px] overflow-hidden rounded-xl bg-surface shadow-lg md:grid-cols-[45fr_55fr]">
        <section className="flex flex-col gap-5 bg-brand p-8 text-white">
          <span className="w-fit rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest">
            {APP_NAME}
          </span>
          <h1 className="text-[28px] font-bold leading-tight">
            Corporate Land Portfolio Management
          </h1>
          <p className="text-sm text-white/85">
            Track company land parcels, titles, tax declarations, and legal issues in one secure,
            audited system.
          </p>
          <ul className="flex flex-col gap-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-lg border border-white/30 bg-white/10 p-3">
                <p className="text-sm font-bold">{f.title}</p>
                <p className="text-sm text-white/85">{f.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-6 text-xs text-white/70">{ORG_NAME} · Internal use only</p>
        </section>

        <section className="p-8 md:p-12">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
              EP
            </span>
            <div>
              <p className="text-sm font-semibold">{APP_NAME}</p>
              <p className="text-xs text-muted">{ORG_NAME} · Legal Department</p>
            </div>
          </div>
          <h2 className="mt-8 text-2xl font-bold">Welcome back</h2>
          <p className="mt-1 text-sm text-muted">Sign in to access your land records.</p>

          <button
            type="button"
            onClick={() => {
              setRole("legal");
              router.push("/login/verify");
            }}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-sm font-medium hover:bg-page"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
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

          <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-muted">
            <span className="h-px flex-1 bg-line" />
            Or sign in with email
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} noValidate>
            <label htmlFor="email" className="block text-sm font-medium">
              Corporate email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="juan.ramos@xcement.example"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
            <label htmlFor="password" className="mt-4 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD}
            />
            <div className="mt-3 flex items-center justify-between text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-[var(--brand)]" />
                Remember this device
              </label>
              <a href="/forgot" className="font-medium text-brand">
                Forgot password?
              </a>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="mt-5 w-full rounded-md bg-brand px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Sign in
            </button>
          </form>

          <p className="mt-4 rounded-md bg-brand-soft px-3 py-2 text-sm text-brand">
            A verification code (authenticator app or email) is required after sign-in.
          </p>
          <p className="mt-4 text-sm text-muted">Need access? Contact your IT Administrator.</p>
        </section>
      </div>
      <p className="mt-6 text-xs text-muted">© 2026 {ORG_NAME}. For internal use only.</p>
    </div>
  );
}
