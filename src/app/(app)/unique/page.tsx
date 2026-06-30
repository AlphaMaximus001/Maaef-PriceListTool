import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { UniqueGrid, type UniqueRow } from "./unique-grid";

export const dynamic = "force-dynamic";

export default async function UniquePage() {
  await requireSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("v_unique")
    .select("my_product_id, my_sku, my_product_name, category, my_price, currency")
    .order("category");

  const rows: UniqueRow[] = (data ?? []).map((r) => ({
    my_sku: r.my_sku,
    my_product_name: r.my_product_name,
    category: r.category ?? "—",
    my_price: Number(r.my_price),
    currency: r.currency,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pricing power</h1>
        <p className="mt-1 text-muted-foreground">
          Products with no confirmed competitor match — where you&apos;re unique and can
          charge a premium.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Every active product currently has a confirmed competitor match.
          </CardContent>
        </Card>
      ) : (
        <UniqueGrid rows={rows} />
      )}
    </div>
  );
}
