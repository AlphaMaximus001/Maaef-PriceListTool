"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/utils";
import { OverlapGrid, type OverlapRow } from "./overlap-grid";
import { createVersionAndEdit } from "../lists/list-actions";
import type { EditResult } from "../lists/my/edit-actions";

function defaultListName(): string {
  const d = new Date();
  return `Undercut edit — ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

export function OverlapClient({
  rows,
  competitorNames,
  canEdit,
  currency,
}: {
  rows: OverlapRow[];
  competitorNames: string[];
  canEdit: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [query, setQuery] = React.useState("");

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [newPrice, setNewPrice] = React.useState("");
  const [listName, setListName] = React.useState("");

  const row = rows.find((r) => r.my_product_id === openId) ?? null;

  const open = (id: string) => {
    const r = rows.find((x) => x.my_product_id === id);
    if (!r) return;
    setOpenId(id);
    setNewPrice(String(r.my_price));
    setListName(defaultListName());
  };

  const close = () => {
    setOpenId(null);
    setNewPrice("");
    setListName("");
  };

  const save = () => {
    if (!row) return;
    const value = Number(newPrice);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a valid price.");
      return;
    }
    if (value === row.my_price) {
      toast.error("That's the same as the current price.");
      return;
    }
    if (!listName.trim()) {
      toast.error("Name the new list.");
      return;
    }
    start(async () => {
      const r = await createVersionAndEdit(listName.trim(), {
        scope: "single",
        operation: "set",
        value,
        targetId: row.my_product_id,
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      // The new list is created and selected; warn if the price sat below the
      // cost floor (then it wasn't applied — adjust it in My Products).
      if ((r.result as EditResult | undefined)?.status === "needs_confirm") {
        toast.warning(`Created "${listName.trim()}", but ${formatPrice(value, currency)} is at or below the cost floor — set it from My Products.`);
      } else {
        toast.success(`Saved to new list "${listName.trim()}".`);
      }
      close();
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search SKU, product, or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <OverlapGrid
        rows={rows}
        competitorNames={competitorNames}
        quickFilterText={query}
        onOpen={canEdit ? open : undefined}
      />

      {canEdit && (
        <p className="text-xs text-muted-foreground">
          Click a row (or <span className="font-medium">Open</span>) to change its price. Every change
          saves into a new list you name — the list you&apos;re viewing is never modified.
        </p>
      )}

      {/* SKU detail — competitors + price editor */}
      <Dialog open={!!row} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-lg">
          {row && (
            <>
              <DialogHeader>
                <DialogTitle>{row.my_product_name}</DialogTitle>
                <DialogDescription>
                  {row.my_sku} · {row.category}
                </DialogDescription>
              </DialogHeader>

              {/* Competitor comparison */}
              <div className="space-y-1.5 rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Your current price</span>
                  <span className="font-semibold">{formatPrice(row.my_price, currency)}</span>
                </div>
                {competitorNames
                  .filter((n) => row.competitors[n] != null)
                  .map((n) => {
                    const p = row.competitors[n];
                    const cheaper = row.my_price <= p;
                    return (
                      <div key={n} className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          {n}
                          {n === row.lowest_competitor_name && <Badge variant="muted" className="text-[10px]">lowest</Badge>}
                        </span>
                        <span className={cheaper ? "text-green-700" : "text-red-700"}>{formatPrice(p, currency)}</span>
                      </div>
                    );
                  })}
                <div className="flex items-center justify-between border-t pt-1.5">
                  <span>Gap vs. cheapest</span>
                  <span className={row.gap > 0 ? "font-medium text-red-700" : "font-medium text-green-700"}>
                    {row.gap === 0 ? "—" : `${row.gap > 0 ? "+" : ""}${formatPrice(row.gap, currency)}`}
                  </span>
                </div>
              </div>

              {/* Price editor */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ov-price">New price ({currency})</Label>
                  <Input
                    id="ov-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ov-list">Save as a new list named</Label>
                  <Input id="ov-list" value={listName} onChange={(e) => setListName(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={close} disabled={pending}>Cancel</Button>
                <Button onClick={save} disabled={pending || !listName.trim()}>
                  {pending ? "Saving…" : "Save to new list"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
