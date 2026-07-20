"use client";

import * as React from "react";
import { ScrollText, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InfoTip } from "@/components/info-tip";
import { HistoryClient, type EditRow } from "../history/history-client";

export type LogEntry = {
  id: string;
  at: string;
  actor: string;
  product: string | null;
  action: string;
  detail: string;
  tone: "price" | "field" | "flag" | "create";
};

export type HistoryProps = {
  rows: EditRow[];
  canUndoSingle: boolean;
  canUndoBatch: boolean;
  canRestore: boolean;
  listName: string;
};

const toneClass: Record<LogEntry["tone"], string> = {
  price: "bg-maaef-red/10 text-maaef-red",
  field: "bg-muted text-foreground/70",
  flag: "bg-amber-100 text-amber-800",
  create: "bg-green-100 text-green-800",
};

function ActivitySection({ entries }: { entries: LogEntry[] }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Activity <InfoTip k="logs.page" side="right" />
        </h2>
        <p className="text-sm text-muted-foreground">
          Who changed what, and when — price edits, product edits, item creation, and flags across all
          lists. Read-only.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No activity yet.
                    </TableCell>
                  </TableRow>
                )}
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(e.at).toLocaleString()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{e.actor}</TableCell>
                    <TableCell>
                      <Badge variant="muted" className={toneClass[e.tone]}>{e.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{e.product ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-foreground/80" title={e.detail}>
                      {e.detail}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type TabKey = "activity" | "history";

export function LogsTabs({
  isAdmin,
  activity,
  history,
  defaultTab,
}: {
  isAdmin: boolean;
  activity: LogEntry[];
  history: HistoryProps;
  defaultTab: TabKey;
}) {
  const [tab, setTab] = React.useState<TabKey>(defaultTab);

  // Non-admins only have the edit-history/restore view — show it directly.
  if (!isAdmin) {
    return <HistoryClient {...history} />;
  }

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "activity", label: "Activity", icon: ScrollText },
    { key: "history", label: "Edit history & restore", icon: History },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Action logs</h1>
        <p className="mt-1 text-muted-foreground">
          A read-only audit of everything, plus your current list&apos;s edit history with undo &amp; restore.
        </p>
      </div>

      <div className="flex items-end gap-1 border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-border bg-card text-foreground"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "activity" ? <ActivitySection entries={activity} /> : <HistoryClient {...history} />}
    </div>
  );
}
