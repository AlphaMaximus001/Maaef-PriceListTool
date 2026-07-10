"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Tag, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InfoTip } from "@/components/info-tip";
import { createItem, setAlias, type CustomizeResult, type NewItemInput } from "./actions";

export type CustomizeRow = {
  id: string;
  sku: string;
  productName: string;
  displayName: string | null;
  category: string | null;
  price: number;
  currency: string;
};

export function CustomizeClient({
  rows,
  categories,
  locked,
  showCost,
  currency,
}: {
  rows: CustomizeRow[];
  categories: string[];
  locked: boolean;
  showCost: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  // New-item form state.
  const [sku, setSku] = React.useState("");
  const [name, setName] = React.useState("");
  const [alias, setAliasField] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [cost, setCost] = React.useState("");

  // Alias editing state.
  const [query, setQuery] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [aliasEdit, setAliasEdit] = React.useState("");

  // Version-name prompt for locked lists. `pendingRun` replays the action.
  const [askName, setAskName] = React.useState(false);
  const [versionName, setVersionName] = React.useState("");
  const pendingRun = React.useRef<((vName?: string) => void) | null>(null);

  const handle = (r: CustomizeResult, onOk: () => void) => {
    if (r.needName) {
      setAskName(true);
      return;
    }
    r.ok ? toast.success(r.message) : toast.error(r.message);
    if (r.ok) {
      setAskName(false);
      setVersionName("");
      onOk();
      router.refresh();
    }
  };

  const doCreate = (vName?: string) => {
    pendingRun.current = doCreate; // so the version-name dialog can replay this
    const input: NewItemInput = {
      sku,
      productName: name,
      displayName: alias || undefined,
      category: category || undefined,
      price: Number(price),
      cost: showCost && cost !== "" ? Number(cost) : null,
    };
    start(async () => {
      const r = await createItem(input, vName);
      handle(r, () => {
        setSku(""); setName(""); setAliasField(""); setCategory(""); setPrice(""); setCost("");
      });
    });
  };

  const doAlias = (productId: string, value: string, vName?: string) => {
    pendingRun.current = (v) => doAlias(productId, value, v); // replay target
    start(async () => {
      const r = await setAlias(productId, value, vName);
      handle(r, () => setEditingId(null));
    });
  };

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      r.sku.toLowerCase().includes(q) ||
      r.productName.toLowerCase().includes(q) ||
      (r.displayName ?? "").toLowerCase().includes(q) ||
      (r.category ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* ── Create a new item ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-maaef-red" /> New item <InfoTip k="customize.newItem" />
          </CardTitle>
          <CardDescription>Adds a product to the current working version and prices it.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="c-sku">SKU code</Label>
              <Input id="c-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. MAAEF-C6-2" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-name">Product name</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Deluxe Banner" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-alias" className="flex items-center gap-1.5">
                Display name <span className="text-xs text-muted-foreground">(optional alias)</span>
              </Label>
              <Input id="c-alias" value={alias} onChange={(e) => setAliasField(e.target.value)} placeholder="Shown in place of the code" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-cat">Category</Label>
              <Input id="c-cat" list="cat-options" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Banners" />
              <datalist id="cat-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-price">Price ({currency})</Label>
              <Input id="c-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </div>
            {showCost && (
              <div className="space-y-2">
                <Label htmlFor="c-cost" className="flex items-center gap-1.5">
                  Cost floor <Badge variant="muted" className="text-[10px]">private</Badge>
                </Label>
                <Input id="c-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="optional" />
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => doCreate()} disabled={pending || !sku.trim() || !name.trim() || price === ""}>
              <Plus className="h-4 w-4" /> Create item
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Custom display names for existing SKUs ────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4 text-maaef-red" /> Custom display names <InfoTip k="customize.alias" />
          </CardTitle>
          <CardDescription>
            Give a SKU a friendly name to show clients. The underlying code never changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search SKU, name, or category…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="divide-y rounded-md border">
            {filtered.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No products match.</p>
            )}
            {filtered.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.displayName || r.productName}</span>
                    <Badge variant="muted" className="font-mono text-xs">{r.sku}</Badge>
                    {r.category && <span className="text-xs text-muted-foreground">{r.category}</span>}
                  </div>
                  {r.displayName && (
                    <p className="text-xs text-muted-foreground">Real name: {r.productName}</p>
                  )}
                </div>

                {editingId === r.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={aliasEdit}
                      onChange={(e) => setAliasEdit(e.target.value)}
                      placeholder="Display name (blank to clear)"
                      className="h-8 w-56"
                    />
                    <Button size="sm" className="h-8" disabled={pending} onClick={() => doAlias(r.id, aliasEdit)}>
                      <Check className="h-4 w-4" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      setEditingId(r.id);
                      setAliasEdit(r.displayName ?? "");
                    }}
                  >
                    {r.displayName ? "Edit name" : "Add name"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Version-name prompt (locked list) */}
      <Dialog open={askName} onOpenChange={setAskName}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save into a new working version</DialogTitle>
            <DialogDescription>
              This list is a locked Original. Name a working version — your change saves there and the
              Original stays untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              autoFocus
              placeholder="e.g. Custom SKUs — July"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAskName(false)}>Cancel</Button>
            <Button
              disabled={pending || !versionName.trim()}
              onClick={() => {
                // Replay whichever action asked for the name.
                if (pendingRun.current) pendingRun.current(versionName);
              }}
            >
              Create &amp; save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
