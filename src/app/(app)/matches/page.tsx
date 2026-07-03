import { redirect } from "next/navigation";
import { getSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentListId } from "@/lib/lists";
import { MatchReviewClient, type MatchRow } from "./match-client";

export const dynamic = "force-dynamic";

type JoinedMatch = {
  id: string;
  confidence: number;
  method: string;
  confirmed: boolean;
  rejected: boolean;
  my_products: { sku: string; product_name: string; category: string | null; price: number; currency: string } | null;
  competitor_items: {
    product_name: string;
    price: number;
    currency: string;
    competitor_lists: { name: string; competitors: { name: string } | null } | null;
  } | null;
};

function toRow(m: JoinedMatch): MatchRow {
  const comp = m.competitor_items;
  return {
    id: m.id,
    confidence: Number(m.confidence),
    method: m.method as "spec_key" | "fuzzy" | "manual",
    confirmed: m.confirmed,
    mySku: m.my_products?.sku ?? "—",
    myName: m.my_products?.product_name ?? "—",
    category: m.my_products?.category ?? "—",
    myPrice: Number(m.my_products?.price ?? 0),
    currency: m.my_products?.currency ?? "INR",
    competitorName: comp?.competitor_lists?.competitors?.name ?? "Competitor",
    competitorListName: comp?.competitor_lists?.name ?? "",
    competitorProduct: comp?.product_name ?? "—",
    competitorPrice: Number(comp?.price ?? 0),
  };
}

export default async function MatchesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const listId = await getCurrentListId();
  const select =
    "id, confidence, method, confirmed, rejected, my_products!inner(sku, product_name, category, price, currency, list_id), competitor_items(product_name, price, currency, competitor_lists(name, competitors(name)))";

  const [{ data: pending }, { data: confirmed }] = listId
    ? await Promise.all([
        supabase
          .from("product_matches")
          .select(select)
          .eq("my_products.list_id", listId)
          .eq("confirmed", false)
          .eq("rejected", false)
          .order("confidence", { ascending: false }),
        supabase
          .from("product_matches")
          .select(select)
          .eq("my_products.list_id", listId)
          .eq("confirmed", true)
          .order("confirmed_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <MatchReviewClient
      pending={((pending as unknown as JoinedMatch[]) ?? []).map(toRow)}
      confirmed={((confirmed as unknown as JoinedMatch[]) ?? []).map(toRow)}
      canConfirm={session.can.confirm_match}
    />
  );
}
