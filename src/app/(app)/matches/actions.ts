"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/capabilities";
import { tokenSetRatio, FUZZY_THRESHOLD } from "@/lib/match";

export type MatchActionResult = { ok: boolean; message: string };

const MAX_FUZZY_PER_PRODUCT = 5;

/**
 * Propose matches (invariant 2: the matcher only proposes; nothing goes live
 * until a human confirms). Two passes: exact spec_key, then token-set fuzzy
 * within the same category. Existing pairs are never disturbed.
 */
export async function runMatcher(): Promise<MatchActionResult> {
  await requireCapability("confirm_match");
  const supabase = await createClient();

  const [{ data: products }, { data: items }, { data: existing }] = await Promise.all([
    supabase.from("my_products").select("id, product_name, category, spec_key").eq("active", true),
    supabase.from("competitor_items").select("id, product_name, category, spec_key"),
    supabase.from("product_matches").select("my_product_id, competitor_item_id"),
  ]);

  if (!products?.length) return { ok: false, message: "No Maaef products to match yet." };
  if (!items?.length) return { ok: false, message: "No competitor items to match against." };

  const seen = new Set((existing ?? []).map((m) => `${m.my_product_id}:${m.competitor_item_id}`));

  // Index competitor items by spec_key and by category for the two passes.
  const byKey = new Map<string, typeof items>();
  const byCategory = new Map<string, typeof items>();
  for (const it of items) {
    if (it.spec_key) {
      const arr = byKey.get(it.spec_key) ?? [];
      arr.push(it);
      byKey.set(it.spec_key, arr as typeof items);
    }
    const cat = (it.category ?? "").toLowerCase();
    const arr = byCategory.get(cat) ?? [];
    arr.push(it);
    byCategory.set(cat, arr as typeof items);
  }

  type Proposal = {
    my_product_id: string;
    competitor_item_id: string;
    confidence: number;
    method: "spec_key" | "fuzzy";
  };
  const proposals: Proposal[] = [];

  for (const p of products) {
    const matchedItemIds = new Set<string>();

    // Pass 1: exact spec_key.
    if (p.spec_key) {
      for (const it of byKey.get(p.spec_key) ?? []) {
        const pairKey = `${p.id}:${it.id}`;
        if (seen.has(pairKey)) continue;
        proposals.push({ my_product_id: p.id, competitor_item_id: it.id, confidence: 1, method: "spec_key" });
        matchedItemIds.add(it.id);
        seen.add(pairKey);
      }
    }

    // Pass 2: fuzzy within the same category, top N over threshold.
    const cat = (p.category ?? "").toLowerCase();
    const candidates: { id: string; score: number }[] = [];
    for (const it of byCategory.get(cat) ?? []) {
      if (matchedItemIds.has(it.id)) continue;
      if (seen.has(`${p.id}:${it.id}`)) continue;
      const score = tokenSetRatio(p.product_name, it.product_name);
      if (score >= FUZZY_THRESHOLD) candidates.push({ id: it.id, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const c of candidates.slice(0, MAX_FUZZY_PER_PRODUCT)) {
      proposals.push({
        my_product_id: p.id,
        competitor_item_id: c.id,
        confidence: Math.round(c.score * 10000) / 10000,
        method: "fuzzy",
      });
      seen.add(`${p.id}:${c.id}`);
    }
  }

  if (proposals.length === 0) {
    return { ok: true, message: "No new matches found. Everything is already proposed or confirmed." };
  }

  const { error } = await supabase.from("product_matches").insert(
    proposals.map((p) => ({ ...p, confirmed: false, rejected: false })),
  );
  if (error) return { ok: false, message: `Could not save proposals: ${error.message}` };

  revalidatePath("/matches");
  const exact = proposals.filter((p) => p.method === "spec_key").length;
  return {
    ok: true,
    message: `Proposed ${proposals.length} new matches (${exact} exact, ${proposals.length - exact} fuzzy). Review and confirm.`,
  };
}

/** Confirm a proposed match — the ONLY place `confirmed` becomes true. */
export async function confirmMatch(matchId: string): Promise<MatchActionResult> {
  const session = await requireCapability("confirm_match");
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_matches")
    .update({
      confirmed: true,
      rejected: false,
      confirmed_by: session.profile.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", matchId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/matches");
  revalidatePath("/overlap");
  revalidatePath("/unique");
  return { ok: true, message: "Match confirmed." };
}

/** Reject a proposed match (or retract a confirmation). */
export async function rejectMatch(matchId: string): Promise<MatchActionResult> {
  const session = await requireCapability("confirm_match");
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_matches")
    .update({
      confirmed: false,
      rejected: true,
      confirmed_by: session.profile.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", matchId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/matches");
  revalidatePath("/overlap");
  revalidatePath("/unique");
  return { ok: true, message: "Match rejected." };
}
