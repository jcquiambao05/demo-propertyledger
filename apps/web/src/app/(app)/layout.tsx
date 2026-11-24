import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppSidebar } from "@/components/AppSidebar";
import { AppShellMain } from "@/components/AppShellMain";
import { CommandPalette } from "@/components/CommandPalette";
import { Providers } from "./providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role) redirect("/login");
  const role = session.user.role;

  return (
    <Providers>
      <div
        style={{
          backgroundColor: "var(--epl-page)",
          color: "var(--epl-ink)",
        }}
        className="relative flex min-h-[100dvh] flex-col bg-page text-ink md:flex-row"
      >
        {/* Architectural Survey Micro-Grid + Theme-Adaptive Ambient Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-survey-grid opacity-80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-ambient-glow"
        />

        <AppSidebar userName={session.user.name || "Authorized User"} role={role} />
        <CommandPalette role={role} />
        <AppShellMain>{children}</AppShellMain>
      </div>
    </Providers>
  );
}
