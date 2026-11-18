// App shell: sidebar per role (CLAUDE.md UI conventions, DEMO_PAGES §4). Navigation is
// convenience only; the API refuses anything the role may not do.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, type Role } from "@/lib/auth";
import { Providers } from "./providers";
import { SignOutButton } from "./sign-out";

const NAV: Record<Role, { href: string; label: string }[]> = {
  LEGAL: [
    { href: "/map", label: "Map" },
    { href: "/properties", label: "Properties" },
    { href: "/due-dates", label: "Due dates" },
  ],
  MANAGEMENT: [
    { href: "/map", label: "Map" },
    { href: "/approvals", label: "Approvals" },
    { href: "/properties", label: "Properties" },
    { href: "/due-dates", label: "Due dates" },
  ],
  TENANT: [{ href: "/map", label: "My properties" }],
  IT_ADMIN: [
    { href: "/admin/users", label: "Users" },
    { href: "/admin/audit", label: "Audit log" },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  LEGAL: "Legal Department",
  MANAGEMENT: "Management",
  TENANT: "Tenant",
  IT_ADMIN: "IT Administrator",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role) redirect("/login");
  const role = session.user.role;
  const it = role === "IT_ADMIN";

  return (
    <Providers>
      <div className={`flex min-h-screen ${it ? "bg-it-page text-it-text" : ""}`}>
        <aside
          className={`w-56 shrink-0 border-r p-4 ${it ? "border-it-line bg-it-surface" : "border-line bg-surface"}`}
        >
          <p className="text-sm font-semibold">
            {process.env.NEXT_PUBLIC_APP_NAME ?? "Eagle Property Ledger"}
          </p>
          <p className={`mt-1 text-xs ${it ? "text-it-muted" : "text-muted"}`}>
            {session.user.name} · {ROLE_LABEL[role]}
          </p>
          <nav className="mt-6 space-y-1">
            {NAV[role].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`block rounded-lg px-3 py-2 text-sm ${it ? "hover:bg-it-line" : "hover:bg-brand-soft"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-8">
            <SignOutButton />
          </div>
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </Providers>
  );
}
