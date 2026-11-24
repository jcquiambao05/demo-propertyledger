"use client";

import { useEffect } from "react";

export function Toast({
  message,
  variant = "success",
  onClose,
  durationMs = 4000,
}: {
  message: string;
  variant?: "success" | "danger";
  onClose: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, onClose]);

  if (!message) return null;

  const isDanger = variant === "danger";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        backgroundColor: "var(--epl-surface)",
        borderColor: "var(--epl-line)",
        color: "var(--epl-ink)",
      }}
      className="no-print animate-fade-up fixed bottom-20 right-4 z-50 flex max-w-sm items-center gap-3 rounded-2xl border px-4 py-3 text-xs shadow-[0_18px_42px_-10px_rgba(12,18,15,0.28)] backdrop-blur-md md:bottom-6 md:right-6"
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
          isDanger ? "bg-danger-bg text-danger" : "bg-brand-soft text-brand-soft-fg"
        }`}
        aria-hidden="true"
      >
        {isDanger ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>

      <p className="flex-1 font-medium leading-snug text-ink">{message}</p>

      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        className="rounded-lg p-1 text-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
