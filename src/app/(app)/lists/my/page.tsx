import Link from "next/link";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { MyProductsGrid, type MyProductRow } from "./my-grid";

export const dynamic = "force-dynamic";

export default async function MyListPage() {
  const { can } = await requireSession();
  const supabase = await createClient();

  const { data: products } = await supabase
    .from("my_products")
    .select("id, sku, product_name, category, price, currency, active")
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
            <Badge>Your list</Badge>
          </div>
          <p className="ml-10 mt-1 text-muted-foreground">
            {rows.length} products. Grouped by category.
            {can.view_cost ? " Cost is visible to you only." : ""}
          </p>
        </div>
      </div>

      <MyProductsGrid rows={rows} showCost={can.view_cost} />

      {!can.edit_price && !can.bulk_edit && (
        <p className="text-xs text-muted-foreground">
          You have read-only access to this list.
        </p>
      )}
    </div>
  );
}
