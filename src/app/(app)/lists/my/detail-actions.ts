"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requireCapability } from "@/lib/capabilities";
import { getCurrentList, LIST_COOKIE } from "@/lib/lists";

export type MarginType = "percent" | "flat" | null;

export type ProductDetailPatch = {
  productId: string;
  product_name?: string;
  category?: string;
  specs?: Record<string, string>;
  cost?: number | null;
  marginType?: MarginType;
  marginValue?: number | null;
};

export type DetailSaveResult = {
  ok: boolean;
  message: string;
  needName?: boolean; // locked list — client must supply a new version name
  listId?: string;
};

export type AuditRow = {
  id: string;
  kind: "price" | "cost" | "margin" | "product_name" | "category" | "specs";
  old: string;
  new: string;
  actor: string;
  at: string;
};

export type FlagRow = {
  id: string;
  reason: string;
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  resolved: boolean;
  resolvedBy: string | null;
  mine: boolean;
  canResolve: boolean;
};

export type ProductDetail = {
  marginType: MarginType;
  marginValue: number | null;
  audit: AuditRow[];
  flags: FlagRow[];
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Everything the SKU detail panel needs: current margin, audit trail, flags. */
export async function getProductDetail(productId: string): Promise<ProductDetail> {
  const session = await requireSession();
  const supabase = await createClient();

  let marginType: MarginType = null;
  let marginValue: number | null = null;
  if (session.can.view_cost || session.can.edit_specs || session.can.view_margin) {
    const { data: pc } = await supabase
      .from("product_costs")
      .select("margin_type, margin_value")
      .eq("product_id", productId)
      .maybeSingle();
    marginType = (pc?.margin_type as MarginType) ?? null;
    marginValue = pc?.margin_value != null ? Number(pc.margin_value) : null;
  }

  const [{ data: priceRows }, { data: changeRows }] = await Promise.all([
    supabase
      .from("price_edits")
      .select("id, old_price, new_price, created_at, profiles!price_edits_actor_fkey(full_name, email)")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("product_change_log")
      .select("id, field, old_value, new_value, created_at, profiles(full_name, email)")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const audit: AuditRow[] = [
    ...((priceRows as unknown as Array<{ id: string; old_price: number; new_price: number; created_at: string; profiles: { full_name: string | null; email: string } | null }>) ?? []).map((r) => ({
      id: `p-${r.id}`,
      kind: "price" as const,
      old: fmtVal(r.old_price),
      new: fmtVal(r.new_price),
      actor: r.profiles?.full_name || r.profiles?.email || "—",
      at: r.created_at,
    })),
    ...((changeRows as unknown as Array<{ id: string; field: string; old_value: unknown; new_value: unknown; created_at: string; profiles: { full_name: string | null; email: string } | null }>) ?? []).map((r) => ({
      id: `c-${r.id}`,
      kind: (r.field as AuditRow["kind"]) ?? "specs",
      old: fmtVal(r.old_value),
      new: fmtVal(r.new_value),
      actor: r.profiles?.full_name || r.profiles?.email || "—",
      at: r.created_at,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const { data: flagRows } = await supabase
    .from("flags")
    .select("id, reason, created_by, created_at, resolved, resolved_by, profiles!flags_created_by_fkey(email)")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  const flags: FlagRow[] = ((flagRows as unknown as Array<{ id: string; reason: string; created_by: string; created_at: string; resolved: boolean; resolved_by: string | null; profiles: { email: string } | null }>) ?? []).map((f) => ({
    id: f.id,
    reason: f.reason,
    createdBy: f.created_by,
    createdByEmail: f.profiles?.email ?? "—",
    createdAt: f.created_at,
    resolved: f.resolved,
    resolvedBy: f.resolved_by,
    mine: f.created_by === session.profile.id,
    canResolve: f.created_by === session.profile.id || session.profile.role === "admin",
  }));

  return { marginType, marginValue, audit, flags };
}

/**
 * Save spec/name/category/cost/margin changes. On a locked list this forks a
 * named version and applies the change there (requirement: spec changes never
 * touch the original). `versionName` is required when the current list is locked.
 */
export async function saveProductDetails(
  patch: ProductDetailPatch,
  versionName?: string,
): Promise<DetailSaveResult> {
  await requireCapability("edit_specs");
  const current = await getCurrentList();
  if (!current) return { ok: false, message: "No list selected." };

  const supabase = await createClient();
  let productId = patch.productId;
  let listId = current.id;

  if (current.locked || current.is_original) {
    if (!versionName?.trim()) return { ok: false, message: "Name the new list.", needName: true };
    const { data: newId, error } = await supabase.rpc("create_list_version", {
      p_source: current.id,
      p_name: versionName.trim(),
    });
    if (error || !newId) return { ok: false, message: error?.message ?? "Could not create version." };
    listId = newId as string;
    // Remap the product to the copy's row (same SKU).
    const { data: orig } = await supabase.from("my_products").select("sku").eq("id", patch.productId).single();
    const { data: copy } = await supabase
      .from("my_products")
      .select("id")
      .eq("list_id", listId)
      .eq("sku", orig?.sku ?? "")
      .single();
    productId = copy?.id ?? patch.productId;
    (await cookies()).set(LIST_COOKIE, listId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }

  // Name / category / specs.
  const fieldPatch: Record<string, unknown> = {};
  if (patch.product_name !== undefined) fieldPatch.product_name = patch.product_name;
  if (patch.category !== undefined) fieldPatch.category = patch.category;
  if (patch.specs !== undefined) fieldPatch.specs = patch.specs;
  if (Object.keys(fieldPatch).length) {
    const { error } = await supabase.rpc("update_product_fields", { p_product_id: productId, p_patch: fieldPatch });
    if (error) return { ok: false, message: error.message };
  }

  // Cost / margin (only if the caller supplied them).
  if (patch.cost !== undefined || patch.marginType !== undefined || patch.marginValue !== undefined) {
    const { error } = await supabase.rpc("set_cost_margin", {
      p_product_id: productId,
      p_cost: patch.cost ?? null,
      p_margin_type: patch.marginType ?? null,
      p_margin_value: patch.marginValue ?? null,
    });
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/lists/my");
  revalidatePath("/overlap");
  return { ok: true, message: "Saved.", listId };
}

// ── Flags ────────────────────────────────────────────────────────────────────

export async function addFlag(productId: string, reason: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession();
  if (!reason.trim()) return { ok: false, message: "Write why you're flagging this." };
  const current = await getCurrentList();
  const supabase = await createClient();
  const { error } = await supabase.from("flags").insert({
    product_id: productId,
    list_id: current?.id ?? null,
    reason: reason.trim(),
    created_by: session.profile.id,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/lists/my");
  return { ok: true, message: "Flagged." };
}

export async function resolveFlag(flagId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  // RLS also enforces creator-or-admin; this is the friendly early check.
  const { error } = await supabase
    .from("flags")
    .update({ resolved: true, resolved_by: session.profile.id, resolved_at: new Date().toISOString() })
    .eq("id", flagId);
  if (error) return { ok: false, message: "Only the person who flagged it (or an admin) can resolve it." };
  revalidatePath("/lists/my");
  return { ok: true, message: "Flag resolved." };
}

/** Admin sets the global default margin (used when a product has no override). */
export async function setDefaultMargin(type: "percent" | "flat", value: number): Promise<{ ok: boolean; message: string }> {
  await requireCapability("edit_specs");
  if (!Number.isFinite(value)) return { ok: false, message: "Enter a number." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ value: { type, value }, updated_at: new Date().toISOString() })
    .eq("key", "default_margin");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/lists/my");
  revalidatePath("/admin");
  return { ok: true, message: "Default margin saved." };
}
