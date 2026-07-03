import Link from "next/link";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList, getLists } from "@/lib/lists";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { type MyProductRow } from "./my-grid";
import { MyListClient } from "./my-list-client";
import { ExportPdfButton } from "@/components/export-pdf-button";

export const dynamic = "force-dynamic";

export default async function MyListPage() {
  const { can } = await requireSession();
  const supabase = await createClient();

  const [currentList, lists] = await Promise.all([getCurrentList(), getLists()]);

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

  const { data: products } = await supabase
    .from("my_products")
    .select("id, sku, product_name, category, price, currency, active")
    .eq("list_id", currentList.id)
    .eq("active", true)
    .order("category", { ascending: true })
    .order("product_name", { ascending: true });

  // Cost is fetched only when permitted. RLS would return nothing anyway —
  // this is belt-and-braces so cost never enters a non-view_cost response.
  let costByProduct = new Map<string, number>();
  if (can.view_cost) {
    const { data: costs } = await supabase.from("product_costs").select("product_id, cost");
    costByProduct = new Map((costs ?? []).map((c) => [c.product_id, Number(c.cost)]));
  }

  const rows: MyProductRow[] = (products ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    product_name: p.product_name,
    category: p.category ?? "—",
    price: Number(p.price),
    currency: p.currency,
    cost: can.view_cost ? costByProduct.get(p.id) ?? null : undefined,
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
          <p className="ml-10 mt-1 text-muted-foreground">
            {rows.length} products in <span className="font-medium">{currentList.name}</span>.
            {can.view_cost ? " Cost is visible to you only." : ""}
          </p>
        </div>
        {can.export_pdf && (
          <ExportPdfButton href="/api/export/my/list" filename="maaef-products.pdf" />
        )}
      </div>

      <MyListClient
        rows={rows}
        categories={categories}
        showCost={can.view_cost}
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
