import Link from "next/link";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList, getAllListProducts } from "@/lib/lists";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/info-tip";
import { FlagsClient, type FlagProduct, type OpenFlag, type ResolvedFlag } from "./flags-client";

export const dynamic = "force-dynamic";

type FlagJoin = {
  id: string;
  reason: string;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  created_by: string;
  my_products: { sku: string; product_name: string; display_name: string | null } | null;
  creator: { email: string; full_name: string | null } | null;
  resolver: { email: string; full_name: string | null } | null;
};

const who = (p: { email: string; full_name: string | null } | null) => p?.full_name || p?.email || "—";
const plabel = (mp: FlagJoin["my_products"]) => (mp ? mp.display_name || mp.product_name : "—");

export default async function FlagsPage() {
  const session = await requireSession();
  const current = await getCurrentList();
  const supabase = await createClient();

  if (!current) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Flags</h1>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No list yet — import your inventory from{" "}
            <Link href="/lists" className="text-maaef-red underline">Price lists</Link> first.
          </CardContent>
        </Card>
      </div>
    );
  }

  type RawProduct = { id: string; sku: string; product_name: string; display_name: string | null; category: string | null };
  const [products, { data: flagData }] = await Promise.all([
    getAllListProducts<RawProduct>(current.id, "id, sku, product_name, display_name, category"),
    supabase
      .from("flags")
      .select(
        "id, reason, created_at, resolved, resolved_at, created_by, " +
          "my_products(sku, product_name, display_name), " +
          "creator:profiles!flags_created_by_fkey(email, full_name), " +
          "resolver:profiles!flags_resolved_by_fkey(email, full_name)",
      )
      .eq("list_id", current.id)
      .order("created_at", { ascending: false }),
  ]);

  const productList: FlagProduct[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    label: p.display_name || p.product_name,
    category: p.category ?? null,
  }));

  const flags = (flagData as unknown as FlagJoin[]) ?? [];
  const isAdmin = session.profile.role === "admin";

  const open: OpenFlag[] = flags
    .filter((f) => !f.resolved)
    .map((f) => ({
      id: f.id,
      productLabel: plabel(f.my_products),
      sku: f.my_products?.sku ?? null,
      reason: f.reason,
      by: who(f.creator),
      at: f.created_at,
      canResolve: f.created_by === session.profile.id || isAdmin,
    }));

  const resolved: ResolvedFlag[] = flags
    .filter((f) => f.resolved)
    .map((f) => ({
      id: f.id,
      productLabel: plabel(f.my_products),
      sku: f.my_products?.sku ?? null,
      reason: f.reason,
      by: who(f.creator),
      at: f.created_at,
      resolvedBy: who(f.resolver),
      resolvedAt: f.resolved_at,
    }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Flags <InfoTip k="flags.page" side="right" />
        </h1>
        <p className="mt-1 text-muted-foreground">
          Raise, track, and resolve flags on <span className="font-medium">{current.name}</span>. Resolved
          flags stay as a training record.
        </p>
      </div>

      <FlagsClient products={productList} open={open} resolved={resolved} listName={current.name} />
    </div>
  );
}
