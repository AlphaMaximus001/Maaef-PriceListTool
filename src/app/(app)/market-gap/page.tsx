import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/info-tip";
import { MarketGapGrid, type MarketGapRow } from "./market-gap-grid";

export const dynamic = "force-dynamic";

export default async function MarketGapPage() {
  await requireSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("v_market_gap")
    .select("competitor_item_id, product_name, category, competitor_price, currency, competitor_name")
    .order("category");

  const rows: MarketGapRow[] = (data ?? []).map((r) => ({
    product_name: r.product_name,
    category: r.category ?? "—",
    competitor_name: r.competitor_name,
    competitor_price: Number(r.competitor_price),
    currency: r.currency,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Market gap <InfoTip k="gap.page" side="right" />
        </h1>
        <p className="mt-1 text-muted-foreground">
          Products competitors sell that you don&apos;t — no confirmed match to any Maaef
          product. Whitespace to consider adding.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No unmatched competitor products. Every competitor item is matched to one of
            yours.
          </CardContent>
        </Card>
      ) : (
        <MarketGapGrid rows={rows} />
      )}
    </div>
  );
}
