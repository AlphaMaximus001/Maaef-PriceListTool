import Link from "next/link";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentListId } from "@/lib/lists";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, PencilRuler } from "lucide-react";
import { AddonManager, type Addon } from "./addon-manager";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ConfiguratorPage() {
  const { can } = await requireSession();
  const supabase = await createClient();
  const listId = await getCurrentListId();

  const [{ data: products }, { data: addons }] = await Promise.all([
    supabase
      .from("my_products")
      .select("id, sku, product_name, category, price, currency")
      .eq("active", true)
      .eq("list_id", listId ?? "00000000-0000-0000-0000-000000000000")
      .order("category")
      .order("product_name"),
    supabase
      .from("spec_addons")
      .select("id, name, applies_to, price_delta, currency")
      .eq("active", true)
      .order("name"),
  ]);

  const addonList: Addon[] = (addons ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    applies_to: a.applies_to,
    price_delta: Number(a.price_delta),
    currency: a.currency,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <PencilRuler className="h-6 w-6 text-maaef-red" /> Configurator
        </h1>
        <p className="mt-1 text-muted-foreground">
          Open a product to toggle spec add-ons and see the price recompute live.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
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

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Add-on catalogue <Badge variant="muted">{addonList.length}</Badge>
              </CardTitle>
              <CardDescription>Fixed price deltas. No cost-derived math.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddonManager addons={addonList} canManage={can.bulk_edit} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
