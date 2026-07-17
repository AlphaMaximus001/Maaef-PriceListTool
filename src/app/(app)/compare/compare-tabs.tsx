"use client";

import * as React from "react";
import { Crosshair, Sparkles, Telescope } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/info-tip";
import { OverlapClient } from "../overlap/overlap-client";
import { type OverlapRow } from "../overlap/overlap-grid";
import { UniqueGrid, type UniqueRow } from "../unique/unique-grid";
import { MarketGapGrid, type MarketGapRow } from "../market-gap/market-gap-grid";

export type CompareData = {
  listName: string | null;
  overlap: {
    rows: OverlapRow[];
    competitorNames: string[];
    canEdit: boolean;
    canBulk: boolean;
    currency: string;
  };
  unique: UniqueRow[];
  gap: MarketGapRow[];
};

type TabKey = "overlap" | "unique" | "gap";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overlap", label: "Undercut Radar", icon: Crosshair },
  { key: "unique", label: "Pricing Power", icon: Sparkles },
  { key: "gap", label: "Market Gap", icon: Telescope },
];

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

export function CompareTabs({ data, defaultTab = "overlap" }: { data: CompareData; defaultTab?: TabKey }) {
  const [tab, setTab] = React.useState<TabKey>(defaultTab);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compare</h1>
        <p className="mt-1 text-muted-foreground">
          Where you overlap, where you&apos;re unique, and what the market has that you don&apos;t —
          switch tabs to explore each.
        </p>
      </div>

      {/* Browser-like tab bar */}
      <div className="flex items-end gap-1 border-b border-border">
        {TABS.map((t) => {
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

      {/* Panels */}
      {tab === "overlap" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              Undercut radar <InfoTip k="overlap.page" side="right" />
            </h2>
            {data.listName && <Badge variant="muted">{data.listName}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Products you overlap on, sorted by where you&apos;re pricier than the cheapest competitor.
          </p>
          {data.overlap.rows.length === 0 ? (
            <Empty>
              No confirmed overlaps yet. Confirm matches in <span className="font-medium">Match review</span>.
            </Empty>
          ) : (
            <OverlapClient
              rows={data.overlap.rows}
              competitorNames={data.overlap.competitorNames}
              canEdit={data.overlap.canEdit}
              canBulk={data.overlap.canBulk}
              currency={data.overlap.currency}
            />
          )}
        </section>
      )}

      {tab === "unique" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              Pricing power <InfoTip k="unique.page" side="right" />
            </h2>
            {data.listName && <Badge variant="muted">{data.listName}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Products with no confirmed competitor match — where you&apos;re unique and can charge a premium.
          </p>
          {data.unique.length === 0 ? (
            <Empty>Every active product currently has a confirmed competitor match.</Empty>
          ) : (
            <UniqueGrid rows={data.unique} />
          )}
        </section>
      )}

      {tab === "gap" && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Market gap <InfoTip k="gap.page" side="right" />
          </h2>
          <p className="text-sm text-muted-foreground">
            Products competitors sell that you don&apos;t — whitespace to consider adding.
          </p>
          {data.gap.length === 0 ? (
            <Empty>No unmatched competitor products. Every competitor item is matched to one of yours.</Empty>
          ) : (
            <MarketGapGrid rows={data.gap} />
          )}
        </section>
      )}
    </div>
  );
}
