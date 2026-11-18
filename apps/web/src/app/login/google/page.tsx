"use client";
// FR-01 Google SSO, after Google: trade the single-use handoff for the MFA challenge, then
// continue to the same TOTP step as password sign-in (FR-02). No session exists yet.
import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function GoogleHandoff() {
  const router = useRouter();
  const params = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const handoff = params.get("h") ?? "";
    (async () => {
      try {
        const res = await fetch("/api/core/auth/google/handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handoff }),
        });
        if (!res.ok) throw new Error();
        sessionStorage.setItem("epl.mfa", JSON.stringify(await res.json()));
        router.replace("/login/verify");
      } catch {
        router.replace("/login?error=google");
      }
    })();
  }, [params, router]);

  return <p className="p-8 text-center text-sm text-muted">Signing you in…</p>;
}

export default function GoogleHandoffPage() {
  return (
    <Suspense>
      <GoogleHandoff />
    </Suspense>
  );
}
