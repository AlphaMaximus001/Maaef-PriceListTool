import { redirect } from "next/navigation";
import { getSession } from "@/lib/capabilities";
import { SidebarNav, type NavGroup, type NavItem } from "@/components/app-shell/sidebar-nav";
import { UserMenu } from "@/components/app-shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { RealtimeWatcher } from "@/components/realtime-watcher";
import { AwaitingAccess } from "@/components/awaiting-access";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { profile, can } = session;

  // Unapproved accounts never see the app — just an "Awaiting access" screen.
  // (RLS already returns no data to them; this is the matching UX gate.)
  if (!profile.approved) {
    return <AwaitingAccess email={profile.email} />;
  }

  // One flat menu — plain names, no section headers. Items the current user
  // can't use (Customize / Admin / Action logs) are simply omitted for them;
  // everything else is always visible. All gating is resolver-driven.
  const items: NavItem[] = [
    // The Dashboard is now a personal home (self details, department directory,
    // pins, notes, quick document downloads) — so it's visible to everyone.
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/lists", label: "Upload List", icon: "lists" },
    { href: "/lists/my", label: "My Lists", icon: "products" },
    { href: "/compare", label: "Filter", icon: "overlap" },
    { href: "/matches", label: "Match Review", icon: "matches" },
    { href: "/configurator", label: "SKU Editor", icon: "configurator" },
    { href: "/flags", label: "Flag SKU", icon: "flags" },
    // Action Logs now also holds the per-list edit history + restore tools,
    // so it's visible to everyone (the all-lists audit tab is admin-only inside).
    { href: "/logs", label: "Action Logs", icon: "logs" },
    ...(can.edit_specs
      ? [{ href: "/customize", label: "Add SKU", icon: "customize" as const }]
      : []),
    { href: "/documents", label: "Upload Documents", icon: "documents" },
    ...(can.manage_users
      ? [{ href: "/admin", label: "Admin", icon: "admin" as const }]
      : []),
  ];
  const groups: NavGroup[] = [{ title: "", items }];

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-maaef-red text-sm font-bold text-white">
            M
          </div>
          <span className="font-semibold tracking-tight">Maaef Pricing</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav groups={groups} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
          <div className="md:hidden font-semibold">Maaef Pricing</div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu email={profile.email} role={profile.role} />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
      <RealtimeWatcher />
    </div>
  );
}
