"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/Modal";

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
  const confirmClass =
    variant === "danger"
      ? "inline-flex items-center justify-center gap-2 rounded-xl bg-[#B42318] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#912018] active:scale-[0.98] disabled:opacity-50"
      : variant === "warning"
        ? "inline-flex items-center justify-center gap-2 rounded-xl bg-[#B54708] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#93370D] active:scale-[0.98] disabled:opacity-50"
        : "btn-primary rounded-xl px-4 py-2";

  return (
    <Modal
      open={open}
      onClose={onCancel}
      busy={busy}
      ariaLabelledBy="confirm-modal-title"
      maxWidthClass="max-w-[390px]"
    >
      <div className="p-6">
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
            className="btn-secondary rounded-xl px-4 py-2"
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
    </Modal>
  );
}
