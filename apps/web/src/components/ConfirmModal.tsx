"use client";

import { useEffect, useState, type ReactNode } from "react";

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 3a9 9 0 0 1 9 9h-2.5a6.5 6.5 0 0 0-6.5-6.5V3Z"
      />
    </svg>
  );
}

export function ConfirmModal({
  open,
  title,
  description,
  children,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  variant = "brand",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "brand" | "danger" | "warning";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setRendered(false), 220);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!rendered) return null;

  const confirmClass =
    variant === "danger"
      ? "inline-flex items-center justify-center gap-2 rounded-xl bg-[#B42318] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#912018] active:scale-[0.98] disabled:opacity-50"
      : variant === "warning"
        ? "inline-flex items-center justify-center gap-2 rounded-xl bg-[#B54708] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#93370D] active:scale-[0.98] disabled:opacity-50"
        : "inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A472A] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#13361F] active:scale-[0.98] disabled:opacity-50";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        visible
          ? "bg-[#0D1712]/40 backdrop-blur-[3px] opacity-100"
          : "bg-[#0D1712]/0 backdrop-blur-none opacity-0 pointer-events-none"
      }`}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-[380px] rounded-2xl border border-[#DCE3DC] bg-white p-6 shadow-[0_24px_64px_-12px_rgba(12,22,17,0.28)] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          visible
            ? "scale-100 translate-y-0 opacity-100"
            : "scale-95 translate-y-2 opacity-0"
        }`}
      >
        <h2
          id="confirm-modal-title"
          className="text-base font-semibold tracking-[-0.015em] text-ink"
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{description}</p>
        )}
        {children && <div className="mt-3.5">{children}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-[#DCE3DC] bg-white px-4 py-2 text-xs font-medium text-[#2A3B31] transition-colors hover:bg-[#F4F6F3] hover:text-ink disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={confirmClass}
          >
            {busy && <Spinner />}
            <span>{busy ? "Working…" : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
