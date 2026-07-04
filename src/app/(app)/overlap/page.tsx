import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList } from "@/lib/lists";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/info-tip";
import { OverlapGrid, type OverlapRow } from "./overlap-grid";

export const dynamic = "force-dynamic";

type VOverlap = {
  my_product_id: string;
  my_sku: string;
  my_product_name: string;
  category: string | null;
  my_price: number;
  currency: string;
  competitor_name: string;
  competitor_price: number;
};

export default async function OverlapPage() {
  await requireSession();
  const supabase = await createClient();
  const currentList = await getCurrentList();

  const { data } = currentList
    ? await supabase
        .from("v_overlap")
        .select("my_product_id, my_sku, my_product_name, category, my_price, currency, competitor_name, competitor_price")
        .eq("list_id", currentList.id)
    : { data: [] };

  const rowsRaw = (data as VOverlap[] | null) ?? [];

  // Aggregate one row per Maaef product, with each competitor's best price
  // pivoted into its own column (so your price sits beside each competitor's).
  const competitorNames = Array.from(new Set(rowsRaw.map((r) => r.competitor_name))).sort();
  const byProduct = new Map<string, OverlapRow>();

  for (const r of rowsRaw) {
    let row = byProduct.get(r.my_product_id);
    if (!row) {
      row = {
        my_product_id: r.my_product_id,
        my_sku: r.my_sku,
        my_product_name: r.my_product_name,
        category: r.category ?? "—",
        my_price: Number(r.my_price),
        currency: r.currency,
        competitors: {},
        lowest_competitor_price: Infinity,
        lowest_competitor_name: "",
        gap: 0,
        i_am_cheapest: false,
      };
      byProduct.set(r.my_product_id, row);
    }
    const price = Number(r.competitor_price);
    const prev = row.competitors[r.competitor_name];
    if (prev === undefined || price < prev) row.competitors[r.competitor_name] = price;
    if (price < row.lowest_competitor_price) {
      row.lowest_competitor_price = price;
      row.lowest_competitor_name = r.competitor_name;
    }
  }

  const rows = Array.from(byProduct.values()).map((row) => {
    // gap > 0 means you're pricier than the cheapest competitor (undercut target).
    row.gap = Math.round((row.my_price - row.lowest_competitor_price) * 100) / 100;
    row.i_am_cheapest = row.my_price <= row.lowest_competitor_price;
    return row;
  });

  // Default ordering: biggest gap where you're pricier, first.
  rows.sort((a, b) => b.gap - a.gap);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Undercut radar</h1>
          <InfoTip k="overlap.page" side="right" />
          {currentList && <Badge variant="muted">{currentList.name}</Badge>}
        </div>
        <p className="mt-1 text-muted-foreground">
          Products you overlap on, sorted by where you&apos;re pricier than the cheapest
          competitor — your undercut targets first.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No confirmed overlaps yet. Confirm matches in <span className="font-medium">Match review</span> and
            they&apos;ll appear here.
          </CardContent>
        </Card>
      ) : (
        <OverlapGrid rows={rows} competitorNames={competitorNames} />
      )}
    </div>
  );
}
