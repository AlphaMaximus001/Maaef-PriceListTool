import Link from "next/link";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList, getLists, getAllListProducts, PAGE_SIZE } from "@/lib/lists";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { type MyProductRow } from "./my-grid";
import { MyListClient } from "./my-list-client";
import { ExportPdfButton } from "@/components/export-pdf-button";
import { InfoTip } from "@/components/info-tip";

export const dynamic = "force-dynamic";

export default async function MyListPage() {
  const supabase = await createClient();

  // Session and list resolution are independent — resolve them together.
  const [{ can }, currentList, lists] = await Promise.all([
    requireSession(),
    getCurrentList(),
    getLists(),
  ]);

  if (!currentList) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Maaef products</h1>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No list yet — import your inventory from <Link href="/lists" className="text-maaef-red underline">Lists</Link>.
          </CardContent>
        </Card>
      </div>
    );
  }

  type RawProduct = {
    id: string; sku: string; product_name: string; display_name: string | null;
    category: string | null; price: number; currency: string;
  };

  // These four datasets are independent, so fetch them CONCURRENTLY instead of
  // one after another — total time is the slowest single fetch, not their sum.
  const loadProducts = () => getAllListProducts<RawProduct>(currentList.id);

  const loadCosts = async () => {
    const map = new Map<string, number>();
    // Cost only when permitted (RLS also blocks it — belt and braces).
    if (!can.view_cost) return map;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data } = await supabase.from("product_costs").select("product_id, cost").range(from, from + PAGE_SIZE - 1);
      if (!data || data.length === 0) break;
      for (const c of data) map.set(c.product_id, Number(c.cost));
      if (data.length < PAGE_SIZE) break;
    }
    return map;
  };

  const loadIntel = async () => {
    const map = new Map<string, { musp: number | null; mp: number | null }>();
    if (!can.view_margin) return map;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data } = await supabase.rpc("pricing_intel", { p_list_id: currentList.id }).range(from, from + PAGE_SIZE - 1);
      const batch = (data as Array<{ product_id: string; musp: number | null; mp: number | null }>) ?? [];
      if (batch.length === 0) break;
      for (const r of batch) map.set(r.product_id, { musp: r.musp != null ? Number(r.musp) : null, mp: r.mp != null ? Number(r.mp) : null });
      if (batch.length < PAGE_SIZE) break;
    }
    return map;
  };

  const loadFlagCounts = async () => {
    const map = new Map<string, number>();
    const { data } = await supabase.from("flags").select("product_id").eq("list_id", currentList.id).eq("resolved", false);
    for (const f of data ?? []) map.set(f.product_id, (map.get(f.product_id) ?? 0) + 1);
    return map;
  };

  const [products, costByProduct, intel, flagCount] = await Promise.all([
    loadProducts(),
    loadCosts(),
    loadIntel(),
    loadFlagCounts(),
  ]);

  const rows: MyProductRow[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    product_name: p.product_name,
    display_name: p.display_name ?? null,
    category: p.category ?? "—",
    price: Number(p.price),
    currency: p.currency,
    cost: can.view_cost ? costByProduct.get(p.id) ?? null : undefined,
    musp: can.view_margin ? intel.get(p.id)?.musp ?? null : undefined,
    mp: can.view_margin ? intel.get(p.id)?.mp ?? null : undefined,
    flags: flagCount.get(p.id) ?? 0,
  }));

  const categories = Array.from(new Set(rows.map((r) => r.category))).sort();
  const locked = currentList.locked || currentList.is_original;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon">
              <Link href="/lists">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">Maaef products</h1>
            {currentList.is_original ? (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> Original
              </Badge>
            ) : (
              <Badge>Version</Badge>
            )}
          </div>
          <p className="ml-10 mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <span>
              {rows.length} products in <span className="font-medium">{currentList.name}</span>.
              {can.view_cost ? " Cost is visible to you only." : ""}
            </span>
            {can.view_cost && <InfoTip k="mylist.costColumn" />}
          </p>
        </div>
        {can.export_pdf && (
          <div className="flex items-center gap-1.5">
            <ExportPdfButton href="/api/export/my/list" filename="maaef-products.pdf" canIntel={can.view_margin} />
            <InfoTip k="mylist.exportPdf" side="bottom" />
          </div>
        )}
      </div>

      <MyListClient
        rows={rows}
        categories={categories}
        showCost={can.view_cost}
        showMargin={can.view_margin}
        canEditSpecs={can.edit_specs}
        canEditSingle={can.edit_price}
        canBulk={can.bulk_edit}
        currentList={currentList}
        lists={lists}
        locked={locked}
      />

      {!can.edit_price && !can.bulk_edit && (
        <p className="text-xs text-muted-foreground">You have read-only access to this list.</p>
      )}
    </div>
  );
}
