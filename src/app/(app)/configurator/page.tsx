import Link from "next/link";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentListId } from "@/lib/lists";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, PencilRuler } from "lucide-react";
import { InfoTip } from "@/components/info-tip";
import { formatPrice } from "@/lib/utils";

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
          <CardDescription>{products?.length ?? 0} active products.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(products ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/configurator/${p.id}`}
              className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted"
            >
              <div>
                <div className="font-medium">{p.product_name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.sku} · {p.category ?? "—"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">{formatPrice(Number(p.price), p.currency)}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
          {(products ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No products yet — import your list first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
