"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListTree,
  Crosshair,
  Sparkles,
  Telescope,
  GitCompareArrows,
  PencilRuler,
  History,
  Settings,
  Flag,
  Wand2,
  ScrollText,
  FolderArchive,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Built in a later phase — shown but inert so the roadmap is legible. */
  comingSoon?: boolean;
};

/** A titled cluster of nav items (one of the seven sections). */
export type NavGroup = {
  /** Section label. Empty string renders the items with no header (e.g. Dashboard). */
  title: string;
  items: NavItem[];
};

const ICONS = {
  dashboard: LayoutDashboard,
  lists: ListTree,
  overlap: Crosshair,
  unique: Sparkles,
  gap: Telescope,
  matches: GitCompareArrows,
  configurator: PencilRuler,
  history: History,
  admin: Settings,
  flags: Flag,
  customize: Wand2,
  logs: ScrollText,
  documents: FolderArchive,
} as const;

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const Icon = ICONS[item.icon];
  const active = pathname === item.href || pathname.startsWith(item.href + "/");

  if (item.comingSoon) {
    return (
      <span
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/50"
        title="Coming in a later phase"
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1">{item.label}</span>
        <Lock className="h-3 w-3" />
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-maaef-red text-white"
          : "text-foreground/80 hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </Link>
  );
}

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  return (
    <nav className="flex flex-col gap-4 p-3">
      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <div key={group.title || "_top"} className="flex flex-col gap-1">
            {group.title && (
              <div className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.title}
              </div>
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        ))}
    </nav>
  );
}
