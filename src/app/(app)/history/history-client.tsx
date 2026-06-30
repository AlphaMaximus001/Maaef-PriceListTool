"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Undo2, Layers } from "lucide-react";
import { undoEdit, undoBatch } from "../lists/my/edit-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

export type EditRow = {
  id: string;
  sku: string;
  productName: string;
  currency: string;
  oldPrice: number;
  newPrice: number;
  operation: string;
  scope: string;
  batchId: string | null;
  reverted: boolean;
  note: string | null;
  createdAt: string;
  actor: string;
};

type Group = {
  batchId: string;
  edits: EditRow[];
  createdAt: string;
  actor: string;
  scope: string;
  operation: string;
  allReverted: boolean;
};

function groupByBatch(rows: EditRow[]): Group[] {
  const map = new Map<string, EditRow[]>();
  for (const r of rows) {
    const key = r.batchId ?? r.id;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .map(([batchId, edits]) => ({
      batchId,
      edits,
      createdAt: edits[0].createdAt,
      actor: edits[0].actor,
      scope: edits[0].scope,
      operation: edits[0].operation,
      allReverted: edits.every((e) => e.reverted),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function HistoryClient({
  rows,
  canUndoSingle,
  canUndoBatch,
}: {
  rows: EditRow[];
  canUndoSingle: boolean;
  canUndoBatch: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const groups = React.useMemo(() => groupByBatch(rows), [rows]);

  const doUndo = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.ok) router.refresh();
    });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit history</h1>
        <p className="mt-1 text-muted-foreground">
          Every price change is logged and reversible. Most recent first.
        </p>
      </div>

      {groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No price edits yet.
          </CardContent>
        </Card>
      )}

      {groups.map((g) => {
        const isBatch = g.edits.length > 1;
        return (
          <Card key={g.batchId} className={g.allReverted ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {isBatch && <Layers className="h-4 w-4 text-muted-foreground" />}
                    {isBatch ? (
                      <>
                        {g.scope === "list" ? "Whole list" : "Category"} · {g.operation} ·{" "}
                        {g.edits.length} products
                      </>
                    ) : (
                      <>
                        {g.edits[0].sku} — {g.edits[0].productName}
                      </>
                    )}
                    {g.allReverted && <Badge variant="muted">Reverted</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {new Date(g.createdAt).toLocaleString()} · {g.actor}
                  </CardDescription>
                </div>
                {isBatch
                  ? canUndoBatch &&
                    !g.allReverted && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => doUndo(() => undoBatch(g.batchId))}
                      >
                        <Undo2 className="h-4 w-4" /> Undo batch
                      </Button>
                    )
                  : canUndoSingle &&
                    !g.edits[0].reverted && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => doUndo(() => undoEdit(g.edits[0].id))}
                      >
                        <Undo2 className="h-4 w-4" /> Undo
                      </Button>
                    )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">SKU</th>
                      <th className="p-2 text-left">Product</th>
                      <th className="p-2 text-right">Old</th>
                      <th className="p-2 text-right">New</th>
                      <th className="p-2 text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.edits.slice(0, isBatch ? 50 : 1).map((e) => {
                      const delta = e.newPrice - e.oldPrice;
                      return (
                        <tr key={e.id} className="border-t">
                          <td className="p-2">{e.sku}</td>
                          <td className="p-2">{e.productName}</td>
                          <td className="p-2 text-right text-muted-foreground line-through">
                            {formatPrice(e.oldPrice, e.currency)}
                          </td>
                          <td className="p-2 text-right font-medium">{formatPrice(e.newPrice, e.currency)}</td>
                          <td
                            className="p-2 text-right"
                            style={{ color: delta > 0 ? "#15803d" : delta < 0 ? "#b91c1c" : undefined }}
                          >
                            {delta > 0 ? "+" : ""}
                            {formatPrice(delta, e.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {isBatch && g.edits.length > 50 && (
                  <p className="p-2 text-xs text-muted-foreground">
                    + {g.edits.length - 50} more in this batch
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
