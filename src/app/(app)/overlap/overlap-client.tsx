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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPrice } from "@/lib/utils";
import { OverlapGrid, type OverlapRow } from "./overlap-grid";
import { createVersionAndEdit } from "../lists/list-actions";
import type { EditResult, EditOperation } from "../lists/my/edit-actions";

function defaultListName(): string {
  const d = new Date();
  return `Undercut edit — ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

const OPERATIONS: { value: EditOperation; label: string }[] = [
  { value: "percentage", label: "Change by %" },
  { value: "flat", label: "Change by ₹" },
  { value: "set", label: "Set all to ₹" },
];

export function OverlapClient({
  rows,
  competitorNames,
  canEdit,
  canBulk,
  currency,
}: {
  rows: OverlapRow[];
  competitorNames: string[];
  canEdit: boolean;
  canBulk: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [query, setQuery] = React.useState("");

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [newPrice, setNewPrice] = React.useState("");
  const [listName, setListName] = React.useState("");

  // Multi-select bulk edit.
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [bulkOp, setBulkOp] = React.useState<EditOperation>("percentage");
  const [bulkValue, setBulkValue] = React.useState("");
  const [bulkListName, setBulkListName] = React.useState("");
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const row = rows.find((r) => r.my_product_id === openId) ?? null;

  const applyBulk = () => {
    const value = Number(bulkValue);
    if (!Number.isFinite(value)) {
      toast.error("Enter a number.");
      return;
    }
    if (bulkOp === "set" && value < 0) {
      toast.error("Set value can't be negative.");
      return;
    }
    if (!bulkListName.trim()) {
      toast.error("Name the new list.");
      return;
    }
    start(async () => {
      const r = await createVersionAndEdit(bulkListName.trim(), {
        scope: "selection",
        operation: bulkOp,
        value,
        targetIds: selectedIds,
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      const res = r.result as EditResult | undefined;
      const applied = res?.applied ?? 0;
      const blocked = res?.blocked ?? 0;
      const parts = [`Saved to new list "${bulkListName.trim()}" · ${applied} price(s) changed`];
      if (blocked) parts.push(`${blocked} blocked below the cost floor`);
      toast.success(parts.join(" · "));
      setBulkOpen(false);
      setBulkValue("");
      setBulkListName("");
      setSelectedIds([]);
      router.refresh();
    });
  };

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

      {/* Bulk bar — appears when rows are ticked. */}
      {canBulk && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-maaef-red/40 bg-maaef-blush/40 p-3">
          <span className="text-sm font-medium text-maaef-purple">
            {selectedIds.length} SKU{selectedIds.length > 1 ? "s" : ""} selected
          </span>
          <Button size="sm" className="ml-auto" disabled={pending} onClick={() => { setBulkListName(defaultListName()); setBulkOpen(true); }}>
            Change prices of selected
          </Button>
        </div>
      )}

      <OverlapGrid
        rows={rows}
        competitorNames={competitorNames}
        quickFilterText={query}
        selectable={canBulk}
        onSelectionChanged={setSelectedIds}
        onOpen={canEdit ? open : undefined}
      />

      {canEdit && (
        <p className="text-xs text-muted-foreground">
          {canBulk ? "Tick rows to change several prices at once, or c" : "C"}lick{" "}
          <span className="font-medium">Open</span> on a row to edit one. Every change saves into a new
          list you name — the list you&apos;re viewing is never modified.
        </p>
      )}

      {/* Bulk edit dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change {selectedIds.length} price{selectedIds.length > 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>
              Applies to every selected SKU and saves into a new list — the list you&apos;re viewing stays
              untouched. Prices below the cost floor are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Operation</Label>
                <Select value={bulkOp} onValueChange={(v) => setBulkOp(v as EditOperation)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-value">
                  {bulkOp === "percentage" ? "Percent (e.g. -5)" : bulkOp === "flat" ? `Amount (${currency}, e.g. -50)` : `Price (${currency})`}
                </Label>
                <Input id="bulk-value" type="number" step="0.01" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-list">Save as a new list named</Label>
              <Input id="bulk-list" value={bulkListName} onChange={(e) => setBulkListName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={applyBulk} disabled={pending || bulkValue === "" || !bulkListName.trim()}>
              {pending ? "Saving…" : "Apply to selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
