"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/capabilities";

export type ActionResult = { ok: boolean; message: string };

/** Upsert the caller's dashboard_prefs row with a partial patch. */
async function patchPrefs(patch: Record<string, unknown>): Promise<ActionResult> {
  const { profile } = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_prefs")
    .upsert(
      { profile_id: profile.id, updated_at: new Date().toISOString(), ...patch },
      { onConflict: "profile_id" },
    );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  return { ok: true, message: "Saved." };
}

/** Pin (or clear, with null) a price list on the caller's dashboard. */
export async function setPinnedList(listId: string | null): Promise<ActionResult> {
  return patchPrefs({ pinned_list_id: listId });
}

/** Pin (or clear, with null) a SKU on the caller's dashboard. */
export async function setPinnedProduct(productId: string | null): Promise<ActionResult> {
  return patchPrefs({ pinned_product_id: productId });
}

/** Save the caller's private notes. */
export async function saveNotes(notes: string): Promise<ActionResult> {
  return patchPrefs({ notes: notes.slice(0, 10000) });
}

export type ProductHit = {
  id: string;
  sku: string;
  name: string;
  price: number;
  currency: string;
  listName: string;
};

/** Search active products by SKU / name to pick one to pin. */
export async function searchProducts(query: string): Promise<ProductHit[]> {
  await requireSession();
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("my_products")
    .select("id, sku, product_name, display_name, price, currency, price_lists(name)")
    .eq("active", true)
    .or(`sku.ilike.%${q}%,product_name.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(20);

  return ((data as unknown as Array<{
    id: string; sku: string; product_name: string; display_name: string | null;
    price: number; currency: string; price_lists: { name: string } | null;
  }>) ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.display_name || p.product_name,
    price: Number(p.price),
    currency: p.currency,
    listName: p.price_lists?.name ?? "—",
  }));
}
