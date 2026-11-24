"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function BackButton({
  fallbackHref = "/properties",
  label = "Return to previous page",
  className = "btn-secondary",
}: {
  fallbackHref?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editable = (e.target as HTMLElement | null)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) return;
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackHref]);

  return (
    <button
      type="button"
      onClick={goBack}
      title={`${label} (Alt + ←)`}
      className={className}
    >
      <span aria-hidden="true">←</span>
      <span>{label}</span>
    </button>
  );
}
