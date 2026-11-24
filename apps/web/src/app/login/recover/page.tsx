"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";

type RecoveryMethod = "question" | "backup";
type Step = "identify" | "answer" | "password";

const PRIMARY_BTN =
  "w-full rounded-[6px] bg-[#040706] px-6 py-3.5 text-sm font-semibold tracking-[0.005em] text-white shadow-[0_14px_30px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.06] transition-all duration-300 hover:bg-[#0b110f] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50";
const INPUT =
  "auth-underline-input mt-1.5 w-full border-0 border-b border-white/25 bg-transparent pb-2 pt-1 text-sm font-normal text-white placeholder:text-white/40 transition-colors duration-300 focus:border-white focus:outline-none disabled:opacity-50";
const LABEL = "block text-[13px] font-semibold tracking-[-0.005em] text-white";

async function postJson(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, body };
}

export default function RecoverPasswordPage() {
  const router = useRouter();
  const [method, setMethod] = useState<RecoveryMethod>("question");
  const [step, setStep] = useState<Step>("identify");
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const pwRules = useMemo(
    () => [
      { id: "len", label: "8+ characters", met: newPassword.length >= 8 },
      { id: "upper", label: "Uppercase (A–Z)", met: /[A-Z]/.test(newPassword) },
      { id: "lower", label: "Lowercase (a–z)", met: /[a-z]/.test(newPassword) },
      { id: "num", label: "Number (0–9)", met: /[0-9]/.test(newPassword) },
      { id: "spec", label: "Special character", met: /[^A-Za-z0-9]/.test(newPassword) },
    ],
    [newPassword],
  );

  // Live 30-second cooldown after 3 wrong answers / backup codes
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

  const locked = cooldownSeconds > 0;

  function resetFlow(nextMethod: RecoveryMethod = method) {
    setMethod(nextMethod);
    setStep("identify");
    setQuestion("");
    setAnswer("");
    setBackupCode("");
    setResetToken(null);
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  /** Shared handling for 401 / 423 responses from the verification steps. */
  function handleVerifyFailure(status: number, body: Record<string, unknown>, fallback: string) {
    if (status === 423 || typeof body.remainingSeconds === "number") {
      setCooldownSeconds(Math.max(1, Number(body.remainingSeconds) || 30));
      setError(null);
      return;
    }
    const msg = typeof body.error === "string" ? body.error : fallback;
    const left = typeof body.attemptsRemaining === "number" ? body.attemptsRemaining : null;
    setError(
      left !== null && left > 0
        ? `${msg} (${left} attempt${left === 1 ? "" : "s"} left before a 30-second cooldown)`
        : msg,
    );
  }

  async function lookupQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (locked || busy) return;
    setError(null);
    if (!email.trim()) {
      setError("Enter your corporate email or account name.");
      return;
    }
    setBusy(true);
    try {
      const { res, body } = await postJson("/api/core/auth/recovery/question", {
        email: email.trim(),
      });
      if (!res.ok) {
        handleVerifyFailure(res.status, body, "No security question is configured for this account.");
        return;
      }
      setQuestion(String(body.question ?? ""));
      setStep("answer");
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (locked || busy) return;
    setError(null);
    if (!answer.trim()) {
      setError("Enter the answer to your security question.");
      return;
    }
    setBusy(true);
    try {
      const { res, body } = await postJson("/api/core/auth/recovery/verify-answer", {
        email: email.trim(),
        answer: answer.trim(),
      });
      if (!res.ok || typeof body.resetToken !== "string") {
        handleVerifyFailure(res.status, body, "The security answer is incorrect.");
        return;
      }
      setResetToken(body.resetToken);
      setAnswer("");
      setStep("password");
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyBackupCode(e: React.FormEvent) {
    e.preventDefault();
    if (locked || busy) return;
    setError(null);
    if (!email.trim()) {
      setError("Enter your corporate email or account name.");
      return;
    }
    if (backupCode.replace(/[^A-Za-z0-9]/g, "").length < 8) {
      setError("Enter your full 8-character backup code (XXXX-XXXX).");
      return;
    }
    setBusy(true);
    try {
      const { res, body } = await postJson("/api/core/auth/recovery/verify-backup-code", {
        email: email.trim(),
        backupCode: backupCode.trim(),
      });
      if (!res.ok || typeof body.resetToken !== "string") {
        handleVerifyFailure(res.status, body, "Invalid or already-used backup code.");
        return;
      }
      setResetToken(body.resetToken);
      setBackupCode("");
      setStep("password");
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function completeReset(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !resetToken) return;
    setError(null);
    if (!pwRules.every((r) => r.met)) {
      setError("New password must meet all complexity requirements.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      const { res, body } = await postJson("/api/core/auth/recovery/complete", {
        resetToken,
        newPassword,
        confirmPassword,
      });
      if (!res.ok) {
        const msg = typeof body.error === "string" ? body.error : "Could not reset password.";
        if (res.status === 401) {
          // Token expired or code already used: start over from verification
          resetFlow();
        }
        setError(msg);
        return;
      }
      router.replace("/login?recovered=1");
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Simple stepper: 1 Verify identity -> 2 New password
  const stepIndex = step === "password" ? 2 : 1;

  return (
    <AuthShell>
      <div className="w-full max-w-[400px]">
        <div className="text-center">
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-white sm:text-[28px]">
            Password Recovery
          </h1>
          <p className="mt-1.5 text-xs font-normal leading-relaxed text-white/65">
            {step === "password"
              ? "Identity verified. Choose a new password for your account."
              : "Verify your identity first. You can set a new password once verification succeeds."}
          </p>
        </div>

        {/* Method selector (only before verification) */}
        {step !== "password" && (
          <div
            role="tablist"
            aria-label="Recovery method"
            className="mt-5 grid grid-cols-2 gap-1 rounded-lg border border-white/15 bg-black/25 p-1"
          >
            {(
              [
                { id: "question", label: "Security Question" },
                { id: "backup", label: "Backup Code" },
              ] as { id: RecoveryMethod; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={method === m.id}
                disabled={busy}
                onClick={() => method !== m.id && resetFlow(m.id)}
                className={`rounded-md px-2 py-2 text-[11px] font-semibold transition-all ${
                  method === m.id
                    ? "bg-white text-[#121D17] shadow-sm"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Step indicator */}
        <ol className="mt-4 flex items-center justify-center gap-2 text-[11px] font-medium">
          <li className={stepIndex === 1 ? "text-white" : "text-emerald-300"}>
            {stepIndex === 2 ? "✓" : "1"} Verify identity
          </li>
          <li aria-hidden="true" className="h-px w-6 bg-white/25" />
          <li className={stepIndex === 2 ? "text-white" : "text-white/40"}>2 New password</li>
        </ol>

        {locked && (
          <div
            role="alert"
            className="mt-4 rounded-[8px] border border-amber-400/35 bg-amber-500/15 px-4 py-3 text-center text-xs leading-relaxed text-amber-100"
          >
            <div className="flex items-center justify-center gap-2 font-semibold text-amber-200">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              <span>Too many wrong attempts — wait {cooldownSeconds}s</span>
            </div>
            <p className="mt-1 text-[11px] text-amber-100/85">
              Recovery is paused for 30 seconds after 3 failed attempts. This was recorded in the
              Admin Logs.
            </p>
          </div>
        )}

        {error && !locked && (
          <p
            role="alert"
            className="mt-4 rounded-[6px] border border-red-400/25 bg-red-500/10 px-3.5 py-2.5 text-center text-xs leading-relaxed text-red-100"
          >
            {error}
          </p>
        )}

        {/* SECURITY QUESTION — step 1a: account */}
        {method === "question" && step === "identify" && (
          <form onSubmit={lookupQuestion} noValidate className="mt-5">
            <label htmlFor="rec-email" className={LABEL}>
              E-mail or Account Name
            </label>
            <input
              id="rec-email"
              type="text"
              autoComplete="username"
              autoFocus
              disabled={locked}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your corporate e-mail or account name"
              className={INPUT}
            />
            <button type="submit" disabled={busy || locked} className={`mt-7 ${PRIMARY_BTN}`}>
              {busy ? "Checking…" : "Continue"}
            </button>
          </form>
        )}

        {/* SECURITY QUESTION — step 1b: answer */}
        {method === "question" && step === "answer" && (
          <form onSubmit={verifyAnswer} noValidate className="mt-5 space-y-5">
            <div className="rounded-lg border border-white/15 bg-white/[0.06] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
                  Security Question
                </p>
                <button
                  type="button"
                  onClick={() => resetFlow("question")}
                  className="text-[10px] font-medium text-white/60 hover:text-white hover:underline"
                >
                  Change account
                </button>
              </div>
              <p className="mt-1 text-xs font-medium leading-relaxed text-white">{question}</p>
            </div>
            <div>
              <label htmlFor="rec-answer" className={LABEL}>
                Your Answer
              </label>
              <input
                id="rec-answer"
                type="text"
                autoFocus
                disabled={locked}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Enter your security answer"
                className={INPUT}
              />
            </div>
            <button type="submit" disabled={busy || locked} className={PRIMARY_BTN}>
              {busy ? "Verifying…" : "Verify Answer"}
            </button>
          </form>
        )}

        {/* BACKUP CODE — step 1: account + code */}
        {method === "backup" && step === "identify" && (
          <form onSubmit={verifyBackupCode} noValidate className="mt-5 space-y-5">
            <div>
              <label htmlFor="bc-email" className={LABEL}>
                E-mail or Account Name
              </label>
              <input
                id="bc-email"
                type="text"
                autoComplete="username"
                autoFocus
                disabled={locked}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your corporate e-mail or account name"
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="bc-code" className={LABEL}>
                One-Time Backup Code
              </label>
              <input
                id="bc-code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                maxLength={9}
                disabled={locked}
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                className={`${INPUT} font-mono uppercase tracking-[0.2em]`}
              />
              <p className="mt-1.5 text-[11px] text-white/55">
                Generated in Settings › Local Security. Each code works once.
              </p>
            </div>
            <button type="submit" disabled={busy || locked} className={PRIMARY_BTN}>
              {busy ? "Verifying code…" : "Verify Backup Code"}
            </button>
          </form>
        )}

        {/* STEP 2 — new password (only after verification) */}
        {step === "password" && resetToken && (
          <form onSubmit={completeReset} noValidate className="animate-fade-up mt-5 space-y-5">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
              <span aria-hidden="true">✓</span>
              <span>
                {method === "backup"
                  ? "Backup code verified. It will be used up once you save your new password."
                  : "Security answer verified."}{" "}
                This step expires in 10 minutes.
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="rec-new-pw" className={LABEL}>
                  New Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-[11px] text-white/60 hover:text-white"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                id="rec-new-pw"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Create a strong password"
                className={INPUT}
              />
            </div>

            <div>
              <label htmlFor="rec-conf-pw" className={LABEL}>
                Confirm New Password
              </label>
              <input
                id="rec-conf-pw"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className={INPUT}
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-[11px]">
              {pwRules.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-1.5 ${r.met ? "text-emerald-300" : "text-white/45"}`}
                >
                  <span>{r.met ? "✓" : "·"}</span>
                  <span>{r.label}</span>
                </div>
              ))}
            </div>

            <button type="submit" disabled={busy} className={PRIMARY_BTN}>
              {busy ? "Saving new password…" : "Reset Password"}
            </button>
            <button
              type="button"
              onClick={() => resetFlow()}
              className="w-full text-center text-[11px] text-white/60 hover:text-white hover:underline"
            >
              Cancel and start over
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-white/50">
          No security question or backup codes? Ask your IT Administrator to reset your password.
        </p>

        <div className="mt-3 text-center">
          <Link
            href="/login"
            className="text-xs font-medium text-white/75 transition-colors hover:text-white hover:underline"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
