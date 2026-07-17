import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList } from "@/lib/lists";
import { type OverlapRow } from "../overlap/overlap-grid";
import { type UniqueRow } from "../unique/unique-grid";
import { type MarketGapRow } from "../market-gap/market-gap-grid";
import { CompareTabs, type CompareData } from "./compare-tabs";

export const dynamic = "force-dynamic";

type VOverlap = {
  my_product_id: string; my_sku: string; my_product_name: string; category: string | null;
  my_price: number; currency: string; competitor_name: string; competitor_price: number;
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { can } = await requireSession();
  const supabase = await createClient();
  const currentList = await getCurrentList();
  const tab = (await searchParams).tab;

  const [overlapRes, uniqueRes, gapRes] = await Promise.all([
    currentList
      ? supabase
          .from("v_overlap")
          .select("my_product_id, my_sku, my_product_name, category, my_price, currency, competitor_name, competitor_price")
          .eq("list_id", currentList.id)
      : Promise.resolve({ data: [] as VOverlap[] }),
    currentList
      ? supabase
          .from("v_unique")
          .select("my_product_id, my_sku, my_product_name, category, my_price, currency")
          .eq("list_id", currentList.id)
          .order("category")
      : Promise.resolve({ data: [] }),
    supabase
      .from("v_market_gap")
      .select("competitor_item_id, product_name, category, competitor_price, currency, competitor_name")
      .order("category"),
  ]);

  // ── Undercut radar: pivot each competitor's best price beside yours ─────────
  const overlapRaw = (overlapRes.data as VOverlap[] | null) ?? [];
  const competitorNames = Array.from(new Set(overlapRaw.map((r) => r.competitor_name))).sort();
  const byProduct = new Map<string, OverlapRow>();
  for (const r of overlapRaw) {
    let row = byProduct.get(r.my_product_id);
    if (!row) {
      row = {
        my_product_id: r.my_product_id, my_sku: r.my_sku, my_product_name: r.my_product_name,
        category: r.category ?? "—", my_price: Number(r.my_price), currency: r.currency,
        competitors: {}, lowest_competitor_price: Infinity, lowest_competitor_name: "",
        gap: 0, i_am_cheapest: false,
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
  const overlapRows = Array.from(byProduct.values()).map((row) => {
    row.gap = Math.round((row.my_price - row.lowest_competitor_price) * 100) / 100;
    row.i_am_cheapest = row.my_price <= row.lowest_competitor_price;
    return row;
  });
  overlapRows.sort((a, b) => b.gap - a.gap);

  const uniqueRows: UniqueRow[] = ((uniqueRes.data as VOverlap[] | null) ?? []).map((r) => ({
    my_sku: r.my_sku, my_product_name: r.my_product_name, category: r.category ?? "—",
    my_price: Number(r.my_price), currency: r.currency,
  }));

  const gapRows: MarketGapRow[] = ((gapRes.data as Array<{ product_name: string; category: string | null; competitor_name: string; competitor_price: number; currency: string }> | null) ?? []).map((r) => ({
    product_name: r.product_name, category: r.category ?? "—", competitor_name: r.competitor_name,
    competitor_price: Number(r.competitor_price), currency: r.currency,
  }));

  const data: CompareData = {
    listName: currentList?.name ?? null,
    overlap: {
      rows: overlapRows,
      competitorNames,
      canEdit: can.edit_price,
      canBulk: can.bulk_edit,
      currency: overlapRows[0]?.currency ?? "INR",
    },
    unique: uniqueRows,
    gap: gapRows,
  };

  const initial = tab === "unique" || tab === "gap" ? tab : "overlap";
  return <CompareTabs data={data} defaultTab={initial} />;
}
