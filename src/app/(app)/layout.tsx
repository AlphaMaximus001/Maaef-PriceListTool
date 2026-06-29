import { redirect } from "next/navigation";
import { getSession } from "@/lib/capabilities";
import { SidebarNav, type NavItem } from "@/components/app-shell/sidebar-nav";
import { UserMenu } from "@/components/app-shell/user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { profile, can } = session;

  // Nav reflects the §8 screen list. Items not yet built are flagged
  // comingSoon; Admin is gated by manage_users (invariant 5 — resolver, not role).
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/lists", label: "Lists", icon: "lists", comingSoon: true },
    { href: "/overlap", label: "Undercut radar", icon: "overlap", comingSoon: true },
    { href: "/unique", label: "Pricing power", icon: "unique", comingSoon: true },
    { href: "/matches", label: "Match review", icon: "matches", comingSoon: true },
    { href: "/configurator", label: "Configurator", icon: "configurator", comingSoon: true },
    { href: "/history", label: "Edit history", icon: "history", comingSoon: true },
    ...(can.manage_users
      ? [{ href: "/admin", label: "Admin", icon: "admin" as const }]
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-maaef-red text-sm font-bold text-white">
            M
          </div>
          <span className="font-semibold tracking-tight">Maaef Pricing</span>
        </div>
        <SidebarNav items={items} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
          <div className="md:hidden font-semibold">Maaef Pricing</div>
          <div className="ml-auto">
            <UserMenu email={profile.email} role={profile.role} />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
