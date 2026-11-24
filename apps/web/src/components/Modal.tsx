"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

let activeScrollLocks = 0;
let savedOverflow = "";
let savedPaddingRight = "";

/**
 * Reference-counted viewport scroll lock with scrollbar-width compensation
 * so opening or closing modals never causes background scrolling or layout shift.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return;

    if (activeScrollLocks === 0) {
      const body = document.body;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      savedOverflow = body.style.overflow;
      savedPaddingRight = body.style.paddingRight;
      body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    activeScrollLocks += 1;

    return () => {
      activeScrollLocks = Math.max(0, activeScrollLocks - 1);
      if (activeScrollLocks === 0 && typeof document !== "undefined") {
        document.body.style.overflow = savedOverflow;
        document.body.style.paddingRight = savedPaddingRight;
      }
    };
  }, [locked]);
}

export function Modal({
  open,
  onClose,
  busy = false,
  ariaLabelledBy,
  ariaLabel,
  maxWidthClass = "max-w-lg",
  align = "center",
  children,
}: {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  maxWidthClass?: string;
  align?: "center" | "top";
  children: ReactNode;
}) {
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      if (typeof document !== "undefined") {
        previousFocusRef.current = document.activeElement as HTMLElement | null;
      }
      setRendered(true);
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(raf2);
      });
      return () => cancelAnimationFrame(raf1);
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setRendered(false);
        previousFocusRef.current?.focus?.();
      }, 210);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useBodyScrollLock(rendered);

  // Escape dismissal & Tab focus trapping
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!busy) {
          e.stopPropagation();
          onClose();
        }
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!rendered || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{ margin: 0 }}
      className={`fixed inset-0 z-[100] !m-0 flex ${
        align === "top" ? "items-start pt-[12vh]" : "items-center"
      } justify-center px-4 py-4 transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        visible
          ? "bg-black/60 backdrop-blur-[4px] opacity-100"
          : "bg-black/0 backdrop-blur-none opacity-0 pointer-events-none"
      }`}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--epl-surface)",
          borderColor: "var(--epl-line)",
          color: "var(--epl-ink)",
        }}
        className={`w-full ${maxWidthClass} overflow-hidden rounded-2xl border shadow-[0_24px_64px_-12px_rgba(8,14,11,0.42)] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          visible
            ? "scale-100 translate-y-0 opacity-100"
            : "scale-95 translate-y-2.5 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
