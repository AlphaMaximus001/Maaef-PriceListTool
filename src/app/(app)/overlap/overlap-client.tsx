"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { applyEdit, type EditInput } from "../lists/my/edit-actions";
import { createVersionAndEdit } from "../lists/list-actions";

export function OverlapClient({
  rows,
  competitorNames,
  canEdit,
  locked,
  currency,
}: {
  rows: OverlapRow[];
  competitorNames: string[];
  canEdit: boolean;
  locked: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [query, setQuery] = React.useState("");

  // Pending edit + how to undo the cell if it's cancelled/rejected.
  const [input, setInput] = React.useState<EditInput | null>(null);
  const revertRef = React.useRef<(() => void) | null>(null);

  // Locked-list version prompt.
  const [askName, setAskName] = React.useState(false);
  const [versionName, setVersionName] = React.useState("");

  // Below-floor confirm (view_cost users).
  const [confirmFloor, setConfirmFloor] = React.useState<{ price: number; floor: number | null } | null>(null);

  const onPriceEdit = (id: string, newPrice: number, revert: () => void) => {
    const ei: EditInput = { scope: "single", operation: "set", value: newPrice, targetId: id };
    revertRef.current = revert;
    if (locked) {
      revert(); // never mutate the locked cell; we'll apply on a new version
      setInput(ei);
      setAskName(true);
      return;
    }
    setInput(ei);
    start(async () => {
      const r = await applyEdit(ei, false);
      if (r.status === "applied") {
        toast.success(`Price updated · ${formatPrice(newPrice, currency)}`);
        router.refresh();
      } else if (r.status === "needs_confirm") {
        setConfirmFloor({ price: r.changes?.[0]?.new ?? newPrice, floor: r.breaches?.[0]?.floor ?? null });
      } else {
        toast.error(r.message ?? "Couldn't update the price.");
        revert();
      }
    });
  };

  const confirmBelowFloor = () => {
    if (!input) return;
    start(async () => {
      const r = await applyEdit(input, true);
      if (r.status === "applied") {
        toast.success("Price updated.");
        setConfirmFloor(null);
        router.refresh();
      } else {
        toast.error(r.message ?? "Couldn't update the price.");
        revertRef.current?.();
        setConfirmFloor(null);
      }
    });
  };

  const applyOnNewVersion = () => {
    if (!input || !versionName.trim()) return;
    start(async () => {
      const r = await createVersionAndEdit(versionName.trim(), input);
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.ok) {
        setAskName(false);
        setVersionName("");
        router.refresh();
      }
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
        editable={canEdit}
        quickFilterText={query}
        onPriceEdit={onPriceEdit}
      />

      {canEdit && (
        <p className="text-xs text-muted-foreground">
          Double-click a value in <span className="font-medium">My price ✎</span> to change it
          {locked ? " — you'll be asked to name a working version, so the Original stays untouched." : "."}
        </p>
      )}

      {/* Locked → name a working version */}
      <Dialog open={askName} onOpenChange={(o) => { if (!o) { setAskName(false); revertRef.current?.(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save the change in a new version</DialogTitle>
            <DialogDescription>
              This list is a locked Original. Name a working version — the new price saves there and the
              Original is never touched.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              autoFocus
              placeholder="e.g. Undercut fixes — July"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAskName(false); revertRef.current?.(); }}>Cancel</Button>
            <Button disabled={pending || !versionName.trim()} onClick={applyOnNewVersion}>
              Create &amp; save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Below-floor confirm */}
      <Dialog open={!!confirmFloor} onOpenChange={(o) => { if (!o) { setConfirmFloor(null); revertRef.current?.(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-maaef-red">
              <AlertTriangle className="h-5 w-5" /> Below the cost floor
            </DialogTitle>
            <DialogDescription>
              {confirmFloor?.floor != null
                ? `The new price ${formatPrice(confirmFloor.price, currency)} is at or below this product's floor of ${formatPrice(confirmFloor.floor, currency)}.`
                : "This price falls at or below the allowed floor."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmFloor(null); revertRef.current?.(); }} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmBelowFloor} disabled={pending}>
              Save anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
