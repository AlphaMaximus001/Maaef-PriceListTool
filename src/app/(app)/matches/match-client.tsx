"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, X, Wand2, ArrowRight } from "lucide-react";
import { runMatcher, confirmMatch, rejectMatch } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";

export type MatchRow = {
  id: string;
  confidence: number;
  method: "spec_key" | "fuzzy" | "manual";
  confirmed: boolean;
  mySku: string;
  myName: string;
  category: string;
  myPrice: number;
  currency: string;
  competitorName: string;
  competitorListName: string;
  competitorProduct: string;
  competitorPrice: number;
};

function ConfidenceBadge({ row }: { row: MatchRow }) {
  if (row.method === "spec_key") return <Badge variant="success">Exact spec</Badge>;
  const pct = Math.round(row.confidence * 100);
  const variant = pct >= 85 ? "default" : pct >= 70 ? "secondary" : "muted";
  return <Badge variant={variant}>{pct}% fuzzy</Badge>;
}

function MatchCard({
  row,
  canConfirm,
  mode,
}: {
  row: MatchRow;
  canConfirm: boolean;
  mode: "pending" | "confirmed";
}) {
  const [pending, start] = React.useTransition();

  const act = (fn: (id: string) => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn(row.id);
      r.ok ? toast.success(r.message) : toast.error(r.message);
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
      <div className="grid flex-1 grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        {/* mine */}
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{row.mySku} · {row.category}</div>
          <div className="truncate font-medium">{row.myName}</div>
          <div className="text-sm">{formatPrice(row.myPrice, row.currency)}</div>
        </div>
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
        {/* theirs */}
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            {row.competitorName}
            {row.competitorListName ? ` · ${row.competitorListName}` : ""}
          </div>
          <div className="truncate font-medium">{row.competitorProduct}</div>
          <div className="text-sm">{formatPrice(row.competitorPrice, row.currency)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ConfidenceBadge row={row} />
        {canConfirm && mode === "pending" && (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(rejectMatch)}>
              <X className="h-4 w-4" /> Reject
            </Button>
            <Button size="sm" disabled={pending} onClick={() => act(confirmMatch)}>
              <Check className="h-4 w-4" /> Confirm
            </Button>
          </>
        )}
        {canConfirm && mode === "confirmed" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act(rejectMatch)}>
            <X className="h-4 w-4" /> Retract
          </Button>
        )}
      </div>
    </div>
  );
}

export function MatchReviewClient({
  pending,
  confirmed,
  canConfirm,
}: {
  pending: MatchRow[];
  confirmed: MatchRow[];
  canConfirm: boolean;
}) {
  const [running, start] = React.useTransition();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Match review</h1>
          <p className="mt-1 text-muted-foreground">
            The matcher only proposes. Nothing affects the overlap view until you confirm it.
          </p>
        </div>
        {canConfirm && (
          <Button
            disabled={running}
            onClick={() =>
              start(async () => {
                const r = await runMatcher();
                r.ok ? toast.success(r.message) : toast.error(r.message);
              })
            }
          >
            <Wand2 className="h-4 w-4" /> {running ? "Matching…" : "Run matcher"}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Proposed <Badge variant="muted">{pending.length}</Badge>
          </CardTitle>
          <CardDescription>Confirm a match to move the product onto the undercut radar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No pending proposals.{canConfirm ? " Run the matcher to find some." : ""}
            </p>
          ) : (
            pending.map((row) => (
              <MatchCard key={row.id} row={row} canConfirm={canConfirm} mode="pending" />
            ))
          )}
        </CardContent>
      </Card>

      {confirmed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Confirmed <Badge variant="success">{confirmed.length}</Badge>
            </CardTitle>
            <CardDescription>These power the overlap view. Retract to undo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {confirmed.map((row) => (
              <MatchCard key={row.id} row={row} canConfirm={canConfirm} mode="confirmed" />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
