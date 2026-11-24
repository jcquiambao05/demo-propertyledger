"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AppShellMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMapWorkspace = pathname === "/map";

  if (isMapWorkspace) {
    return (
      <div className="relative z-10 flex h-[calc(100dvh-4rem)] min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-4 md:h-[100dvh] md:p-5">
        <main className="bento-shell relative flex h-full w-full flex-1 flex-col overflow-hidden p-1.5 sm:p-2">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex min-w-0 flex-1 flex-col">
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-4 pb-24 sm:px-7 sm:py-6 md:pb-6">
        {children}
      </main>
    </div>
  );
}
