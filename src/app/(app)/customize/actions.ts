"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/capabilities";
import { getCurrentList, LIST_COOKIE } from "@/lib/lists";

export type CustomizeResult = {
  ok: boolean;
  message: string;
  needName?: boolean; // current list is locked — client must name a working version
  listId?: string;
};

function mapError(msg: string): string {
  if (msg.includes("LIST_LOCKED")) return "This list is locked. Name a working version to save into.";
  if (msg.includes("already exists")) return msg;
  return msg;
}

/**
 * Ensures we operate on an EDITABLE list. If the current list is a locked
 * original, forks a named working version (and switches the cookie to it) so
 * the original is never touched. Returns the editable list id, or a needName
 * signal when the caller hasn't supplied a version name yet.
 */
async function ensureEditableList(
  versionName?: string,
): Promise<{ listId: string } | { needName: true } | { error: string }> {
  const current = await getCurrentList();
  if (!current) return { error: "No list selected." };
  if (!(current.locked || current.is_original)) return { listId: current.id };

  if (!versionName?.trim()) return { needName: true };
  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("create_list_version", {
    p_source: current.id,
    p_name: versionName.trim(),
  });
  if (error || !newId) return { error: error?.message ?? "Could not create version." };
  (await cookies()).set(LIST_COOKIE, newId as string, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  return { listId: newId as string };
}

export type NewItemInput = {
  sku: string;
  productName: string;
  displayName?: string;
  category?: string;
  price: number;
  cost?: number | null;
};

/** Create a brand-new item on the current working version (§5). */
export async function createItem(input: NewItemInput, versionName?: string): Promise<CustomizeResult> {
  await requireCapability("edit_specs");
  if (!input.sku.trim()) return { ok: false, message: "Enter a SKU code." };
  if (!input.productName.trim()) return { ok: false, message: "Enter a product name." };
  if (!Number.isFinite(input.price) || input.price < 0) return { ok: false, message: "Enter a valid price." };

  const ed = await ensureEditableList(versionName);
  if ("needName" in ed) return { ok: false, message: "Name the new working version.", needName: true };
  if ("error" in ed) return { ok: false, message: ed.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_product", {
    p_list_id: ed.listId,
    p_sku: input.sku.trim(),
    p_name: input.productName.trim(),
    p_category: input.category?.trim() || null,
    p_price: input.price,
    p_display_name: input.displayName?.trim() || null,
    p_cost: input.cost ?? null,
  });
  if (error) return { ok: false, message: mapError(error.message) };

  revalidatePath("/customize");
  revalidatePath("/lists/my");
  return { ok: true, message: "Item created.", listId: ed.listId };
}

/**
 * Set (or clear) a product's custom display alias (§5 "rename the SKU to a
 * custom name"). The underlying SKU code is never changed. On a locked list
 * this forks a working version and applies the alias to the copy.
 */
export async function setAlias(productId: string, alias: string, versionName?: string): Promise<CustomizeResult> {
  await requireCapability("edit_specs");

  const supabase = await createClient();
  const current = await getCurrentList();
  if (!current) return { ok: false, message: "No list selected." };

  let targetId = productId;
  let listId = current.id;

  if (current.locked || current.is_original) {
    const ed = await ensureEditableList(versionName);
    if ("needName" in ed) return { ok: false, message: "Name the new working version.", needName: true };
    if ("error" in ed) return { ok: false, message: ed.error };
    listId = ed.listId;
    // Remap to the copy's row (same SKU).
    const { data: orig } = await supabase.from("my_products").select("sku").eq("id", productId).single();
    const { data: copy } = await supabase
      .from("my_products")
      .select("id")
      .eq("list_id", listId)
      .eq("sku", orig?.sku ?? "")
      .single();
    targetId = copy?.id ?? productId;
  }

  const { error } = await supabase.rpc("update_product_fields", {
    p_product_id: targetId,
    p_patch: { display_name: alias.trim() },
  });
  if (error) return { ok: false, message: mapError(error.message) };

  revalidatePath("/customize");
  revalidatePath("/lists/my");
  return { ok: true, message: alias.trim() ? "Alias saved." : "Alias cleared.", listId };
}
