"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AlertTriangle, Save, Plus, Trash2 } from "lucide-react";
import { saveConfiguration, createSkuAddon, deleteAddon } from "../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/info-tip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/utils";

export type ConfigAddon = {
  id: string;
  name: string;
  price_delta: number;
  currency: string;
  productScoped?: boolean; // true = belongs to THIS SKU (can be deleted here)
};

export function ConfiguratorClient({
  productId,
  basePrice,
  currency,
  specs,
  addons,
  savedIds,
  canEdit,
  canManageAddons,
  canViewCost,
}: {
  productId: string;
  basePrice: number;
  currency: string;
  specs: Record<string, string>;
  addons: ConfigAddon[];
  savedIds: string[];
  canEdit: boolean;
  canManageAddons: boolean;
  canViewCost: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set(savedIds));
  const [pending, start] = React.useTransition();
  const [confirmFloor, setConfirmFloor] = React.useState<{ floor: number; price: number } | null>(null);

  // New per-SKU add-on form.
  const [newName, setNewName] = React.useState("");
  const [newDelta, setNewDelta] = React.useState("");

  const addAddon = () => {
    const delta = Number(newDelta);
    start(async () => {
      const r = await createSkuAddon(productId, newName, delta);
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.ok) {
        setNewName("");
        setNewDelta("");
        router.refresh();
      }
    });
  };

  const removeAddon = (id: string) => {
    start(async () => {
      const r = await deleteAddon(id);
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.ok) {
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        router.refresh();
      }
    });
  };

  const total = React.useMemo(() => {
    let t = basePrice;
    for (const a of addons) if (selected.has(a.id)) t += a.price_delta;
    return Math.round(t * 100) / 100;
  }, [basePrice, addons, selected]);

  const dirty =
    total !== Math.round((basePrice + savedIds.reduce((s, id) => s + (addons.find((a) => a.id === id)?.price_delta ?? 0), 0)) * 100) / 100 ||
    [...selected].sort().join() !== [...savedIds].sort().join();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const doSave = (confirm: boolean) => {
    start(async () => {
      const r = await saveConfiguration(productId, [...selected], total, confirm);
      if (r.status === "applied") {
        toast.success(`Saved · ${formatPrice(r.new_price ?? total, currency)}`);
        setConfirmFloor(null);
        router.refresh();
      } else if (r.status === "needs_confirm") {
        setConfirmFloor({ floor: r.floor ?? 0, price: r.new_price ?? total });
      } else if (r.status === "blocked") {
        toast.error("That price is at or below the allowed floor — not saved.");
        setConfirmFloor(null);
      } else {
        toast.error(r.message ?? "Couldn't save.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Configured price <InfoTip k="config.price" />
            </CardTitle>
            <CardDescription>Base {formatPrice(basePrice, currency)} + selected add-ons</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold text-maaef-red">{formatPrice(total, currency)}</div>
            {total !== basePrice && (
              <div className="text-xs text-muted-foreground">
                {total > basePrice ? "+" : ""}
                {formatPrice(total - basePrice, currency)} from add-ons
              </div>
            )}
          </div>
        </CardHeader>
        {Object.keys(specs).length > 0 && (
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(specs).map(([k, v]) => (
                <Badge key={k} variant="muted">
                  {k}: {v}
                </Badge>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Add-ons for this SKU <InfoTip k="config.addons" />
          </CardTitle>
          <CardDescription>
            Add-ons specific to this product. Toggle to see the price recompute.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {addons.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No add-ons for this SKU yet.{canManageAddons ? " Create one below." : ""}
            </p>
          )}
          {addons.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  {a.price_delta >= 0 ? "+" : ""}
                  {formatPrice(a.price_delta, a.currency)}
                  {a.productScoped === false && <span className="ml-2 italic">(shared)</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={selected.has(a.id)}
                  disabled={!canEdit || pending}
                  onCheckedChange={() => toggle(a.id)}
                />
                {canManageAddons && a.productScoped && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    disabled={pending}
                    onClick={() => removeAddon(a.id)}
                    aria-label={`Delete ${a.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {/* Inline creation — add-ons specific to this SKU. */}
          {canManageAddons && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="addon-name" className="text-xs">Add-on name</Label>
                <Input
                  id="addon-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Lamination"
                  className="h-9"
                />
              </div>
              <div className="w-32 space-y-1">
                <Label htmlFor="addon-delta" className="text-xs">Price (±{currency})</Label>
                <Input
                  id="addon-delta"
                  type="number"
                  step="0.01"
                  value={newDelta}
                  onChange={(e) => setNewDelta(e.target.value)}
                  placeholder="120"
                  className="h-9"
                />
              </div>
              <Button
                className="h-9"
                disabled={pending || !newName.trim() || newDelta === ""}
                onClick={addAddon}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => doSave(false)} disabled={pending || !dirty}>
            <Save className="h-4 w-4" /> {pending ? "Saving…" : "Save configuration"}
          </Button>
        </div>
      )}

      <Dialog open={!!confirmFloor} onOpenChange={(o) => !o && setConfirmFloor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-maaef-red">
              <AlertTriangle className="h-5 w-5" /> Below the cost floor
            </DialogTitle>
            <DialogDescription>
              {confirmFloor && canViewCost ? (
                <>
                  The configured price {formatPrice(confirmFloor.price, currency)} is at or below this
                  product&apos;s floor of {formatPrice(confirmFloor.floor, currency)}.
                </>
              ) : (
                "This configuration falls at or below the allowed floor."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFloor(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => doSave(true)} disabled={pending}>
              Save anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
