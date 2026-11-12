"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TENANT_ASSIGNED } from "@/demo/mock-data";
import { useRole } from "@/demo/role";

// RBAC in the real system is enforced in API middleware; the demo mimics it here (FR access rules, demo only).
export default function PropertyGuard({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const { role } = useRole();
  const router = useRouter();
  const denied = role === "tenant" && !TENANT_ASSIGNED.includes(params.id);

  useEffect(() => {
    if (denied) router.replace("/denied");
  }, [denied, router]);

  return denied ? null : <>{children}</>;
}
