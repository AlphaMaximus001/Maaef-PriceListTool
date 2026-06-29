"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListTree,
  Crosshair,
  Sparkles,
  GitCompareArrows,
  PencilRuler,
  History,
  Settings,
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

const ICONS = {
  dashboard: LayoutDashboard,
  lists: ListTree,
  overlap: Crosshair,
  unique: Sparkles,
  matches: GitCompareArrows,
  configurator: PencilRuler,
  history: History,
  admin: Settings,
} as const;

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(item.href + "/");

        if (item.comingSoon) {
          return (
            <span
              key={item.label}
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
            key={item.href}
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
      })}
    </nav>
  );
}
