import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppSidebar } from "@/components/AppSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { Providers } from "./providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role) redirect("/login");
  const role = session.user.role;

  return (
    <Providers>
      <div className="relative flex min-h-[100dvh] bg-page text-ink">
        {/* Architectural Survey Micro-Grid + Ambient Forest-Sage Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-survey-grid opacity-80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_85%_12%,rgba(118,184,42,0.07),transparent_42%),radial-gradient(circle_at_18%_88%,rgba(26,71,42,0.06),transparent_48%)]"
        />

        <AppSidebar userName={session.user.name || "Authorized User"} role={role} />
        <CommandPalette role={role} />

        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-5 sm:px-7 sm:py-6">
            {children}
          </main>
        </div>
      </div>
    </Providers>
  );
}
