import { redirect } from "next/navigation";
import { getSession } from "@/lib/capabilities";
import { SidebarNav, type NavGroup } from "@/components/app-shell/sidebar-nav";
import { UserMenu } from "@/components/app-shell/user-menu";
import { RealtimeWatcher } from "@/components/realtime-watcher";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { profile, can } = session;

  // Navigation is organised into the seven sections of the system. Sections
  // whose items are all gated away for this user collapse automatically
  // (SidebarNav drops empty groups). All access is resolver-driven (invariant 5).
  const groups: NavGroup[] = [
    { title: "", items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }] },
    {
      title: "Upload hub",
      items: [{ href: "/lists", label: "Price lists", icon: "lists" }],
    },
    {
      title: "View & compare",
      items: [
        { href: "/lists/my", label: "My products", icon: "lists" },
        { href: "/overlap", label: "Undercut radar", icon: "overlap" },
        { href: "/unique", label: "Pricing power", icon: "unique" },
        { href: "/market-gap", label: "Market gap", icon: "gap" },
        { href: "/matches", label: "Match review", icon: "matches" },
        { href: "/flags", label: "Flag history", icon: "flags" },
      ],
    },
    {
      title: "Edit & export",
      items: [
        { href: "/configurator", label: "Configurator", icon: "configurator" },
        { href: "/history", label: "Edit history", icon: "history" },
      ],
    },
    ...(can.edit_specs
      ? [{
          title: "Customization",
          items: [{ href: "/customize", label: "Customize SKUs", icon: "customize" as const }],
        }]
      : []),
    {
      title: "Documents",
      items: [{ href: "/documents", label: "Documents", icon: "documents" }],
    },
    ...(can.manage_users
      ? [{
          title: "Administration",
          items: [
            { href: "/admin", label: "Admin & permissions", icon: "admin" as const },
            { href: "/logs", label: "Action logs", icon: "logs" as const },
          ],
        }]
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
        <div className="flex-1 overflow-y-auto">
          <SidebarNav groups={groups} />
        </div>
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
      <RealtimeWatcher />
    </div>
  );
}
