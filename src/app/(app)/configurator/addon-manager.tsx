"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createAddon, deleteAddon } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";

export type Addon = {
  id: string;
  name: string;
  applies_to: string | null;
  price_delta: number;
  currency: string;
};

export function AddonManager({ addons, canManage }: { addons: Addon[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {addons.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{a.name}</div>
              <div className="text-xs text-muted-foreground">
                {a.applies_to ? <Badge variant="muted">{a.applies_to}</Badge> : "All categories"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={a.price_delta >= 0 ? "text-foreground" : "text-maaef-red"}>
                {a.price_delta >= 0 ? "+" : ""}
                {formatPrice(a.price_delta, a.currency)}
              </span>
              {canManage && (
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteAddon(a.id);
                      r.ok ? toast.success(r.message) : toast.error(r.message);
                      if (r.ok) router.refresh();
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
        {addons.length === 0 && (
          <li className="py-4 text-center text-sm text-muted-foreground">No add-ons yet.</li>
        )}
      </ul>

      {canManage && (
        <form
          action={(fd) =>
            start(async () => {
              const r = await createAddon(fd);
              r.ok ? toast.success(r.message) : toast.error(r.message);
              if (r.ok) {
                router.refresh();
                (document.getElementById("addon-form") as HTMLFormElement)?.reset();
              }
            })
          }
          id="addon-form"
          className="space-y-2 border-t pt-3"
        >
          <Input name="name" placeholder="Add-on name (e.g. Lamination)" required />
          <div className="flex gap-2">
            <Input name="applies_to" placeholder="Category (blank = all)" />
            <Input name="price_delta" type="number" step="any" placeholder="+₹ delta" required className="w-28" />
          </div>
          <Button type="submit" size="sm" disabled={pending} className="w-full">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
      )}
    </div>
  );
}
