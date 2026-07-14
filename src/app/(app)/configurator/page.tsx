import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentListId } from "@/lib/lists";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PencilRuler } from "lucide-react";
import { InfoTip } from "@/components/info-tip";
import { ConfiguratorList, type ConfigProduct } from "./configurator-list";

export const dynamic = "force-dynamic";

export default async function ConfiguratorPage() {
  await requireSession();
  const supabase = await createClient();
  const listId = await getCurrentListId();

  const { data: products } = await supabase
    .from("my_products")
    .select("id, sku, product_name, category, price, currency")
    .eq("active", true)
    .eq("list_id", listId ?? "00000000-0000-0000-0000-000000000000")
    .order("category")
    .order("product_name");

  const list: ConfigProduct[] = (products ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    product_name: p.product_name,
    category: p.category ?? null,
    price: Number(p.price),
    currency: p.currency,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <PencilRuler className="h-6 w-6 text-maaef-red" /> Configurator
          <InfoTip k="config.page" />
        </h1>
        <p className="mt-1 text-muted-foreground">
          Open a product to create its own add-ons, toggle them, and watch the price recompute.
          Add-ons are specific to each SKU.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>{list.length} active products. Search a SKU or category to jump.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConfiguratorList products={list} />
        </CardContent>
      </Card>
    </div>
  );
}
