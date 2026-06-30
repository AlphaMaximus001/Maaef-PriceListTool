"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AlertTriangle, Save } from "lucide-react";
import { saveConfiguration } from "../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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

export type ConfigAddon = {
  id: string;
  name: string;
  price_delta: number;
  currency: string;
};

export function ConfiguratorClient({
  productId,
  basePrice,
  currency,
  specs,
  addons,
  savedIds,
  canEdit,
  canViewCost,
}: {
  productId: string;
  basePrice: number;
  currency: string;
  specs: Record<string, string>;
  addons: ConfigAddon[];
  savedIds: string[];
  canEdit: boolean;
  canViewCost: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set(savedIds));
  const [pending, start] = React.useTransition();
  const [confirmFloor, setConfirmFloor] = React.useState<{ floor: number; price: number } | null>(null);

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
            <CardTitle>Configured price</CardTitle>
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
          <CardTitle>Spec add-ons</CardTitle>
          <CardDescription>Fixed deltas. Toggle to see the price recompute.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {addons.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No add-ons apply to this category.
            </p>
          )}
          {addons.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  {a.price_delta >= 0 ? "+" : ""}
                  {formatPrice(a.price_delta, a.currency)}
                </div>
              </div>
              <Switch
                checked={selected.has(a.id)}
                disabled={!canEdit || pending}
                onCheckedChange={() => toggle(a.id)}
              />
            </div>
          ))}
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
