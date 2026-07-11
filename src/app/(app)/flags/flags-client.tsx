"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Flag, Search, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/info-tip";
import { addFlag, resolveFlag } from "@/app/(app)/lists/my/detail-actions";

export type FlagProduct = { id: string; sku: string; label: string; category: string | null };

export type OpenFlag = {
  id: string;
  productLabel: string;
  sku: string | null;
  reason: string;
  by: string;
  at: string;
  canResolve: boolean;
};

export type ResolvedFlag = {
  id: string;
  productLabel: string;
  sku: string | null;
  reason: string;
  by: string;
  at: string;
  resolvedBy: string;
  resolvedAt: string | null;
};

/** Raise a flag, see what's open, and browse resolved flags — all in one page. */
export function FlagsClient({
  products,
  open,
  resolved,
  listName,
}: {
  products: FlagProduct[];
  open: OpenFlag[];
  resolved: ResolvedFlag[];
  listName: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const [query, setQuery] = React.useState("");
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const picked = products.find((p) => p.id === pickedId) ?? null;

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.label.toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, products]);

  const raise = () => {
    if (!pickedId || !reason.trim()) return;
    start(async () => {
      const r = await addFlag(pickedId, reason);
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.ok) {
        setReason("");
        setPickedId(null);
        setQuery("");
        router.refresh();
      }
    });
  };

  const resolve = (id: string) => {
    start(async () => {
      const r = await resolveFlag(id);
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Raise a flag */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Flag className="h-4 w-4 text-maaef-red" /> Flag an item <InfoTip k="flags.raise" />
          </CardTitle>
          <CardDescription>
            Find the product, say what&apos;s wrong, and flag it. Flags are internal and stay until resolved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {picked ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
              <div>
                <span className="font-medium">{picked.label}</span>{" "}
                <Badge variant="muted" className="font-mono text-xs">{picked.sku}</Badge>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPickedId(null)}>Change</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="flag-search">Product</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="flag-search"
                  className="pl-9"
                  placeholder="Search a SKU, name, or category…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {matches.length > 0 && (
                <div className="divide-y rounded-md border">
                  {matches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPickedId(p.id); setQuery(""); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>{p.label}</span>
                      <Badge variant="muted" className="font-mono text-xs">{p.sku}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="flag-reason">Reason</Label>
            <textarea
              id="flag-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Price looks too low vs. competitor — please review."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={raise} disabled={pending || !pickedId || !reason.trim()}>
              <Flag className="h-4 w-4" /> Raise flag
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Open flags */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Open ({open.length})</h2>
        {open.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nothing open. All clear.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {open.map((f) => (
              <Card key={f.id} className="border-maaef-red/30">
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {f.productLabel}
                      {f.sku && <Badge variant="muted" className="font-mono text-xs">{f.sku}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-foreground/80">{f.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Flagged by {f.by} · {new Date(f.at).toLocaleString()}
                    </p>
                  </div>
                  {f.canResolve && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => resolve(f.id)}>
                      <Check className="h-4 w-4" /> Resolve
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Resolved — training history */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Resolved ({resolved.length})</h2>
        {resolved.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No resolved flags yet.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {resolved.map((f) => (
              <Card key={f.id}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-2 font-medium">
                    {f.productLabel}
                    {f.sku && <Badge variant="muted" className="font-mono text-xs">{f.sku}</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-foreground/80">{f.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Flagged by {f.by} · {new Date(f.at).toLocaleDateString()} → Resolved by {f.resolvedBy}
                    {f.resolvedAt ? ` · ${new Date(f.resolvedAt).toLocaleDateString()}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
