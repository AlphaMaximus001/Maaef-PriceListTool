"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/capabilities";

export type SaveConfigResult = {
  status: "applied" | "needs_confirm" | "blocked" | "error";
  message?: string;
  new_price?: number;
  floor?: number;
};

/**
 * Persist selected add-ons + the recomputed price. Routed through the DB guard
 * so a configurator save honors the audit trail and undercut guard like any
 * other single edit (invariants 4 & 6).
 */
export async function saveConfiguration(
  productId: string,
  selectedAddonIds: string[],
  newPrice: number,
  confirm: boolean,
): Promise<SaveConfigResult> {
  await requireCapability("edit_price");
  if (!Number.isFinite(newPrice)) return { status: "error", message: "Invalid price." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_configuration", {
    p_product_id: productId,
    p_config: { addons: selectedAddonIds },
    p_new_price: newPrice,
    p_confirm: confirm,
  });
  if (error) return { status: "error", message: error.message };

  const result = data as SaveConfigResult;
  if (result.status === "applied") {
    revalidatePath(`/configurator/${productId}`);
    revalidatePath("/lists/my");
    revalidatePath("/overlap");
    revalidatePath("/history");
  }
  return result;
}

// ── Add-on catalogue management (bulk_edit) ──────────────────────────────────

export async function createAddon(formData: FormData): Promise<{ ok: boolean; message: string }> {
  await requireCapability("bulk_edit");
  const name = String(formData.get("name") || "").trim();
  const appliesTo = String(formData.get("applies_to") || "").trim() || null;
  const delta = Number(formData.get("price_delta"));
  if (!name) return { ok: false, message: "Name is required." };
  if (!Number.isFinite(delta)) return { ok: false, message: "Price delta must be a number." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("spec_addons")
    .insert({ name, applies_to: appliesTo, price_delta: delta });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/configurator");
  return { ok: true, message: `Added "${name}".` };
}

export async function deleteAddon(id: string): Promise<{ ok: boolean; message: string }> {
  await requireCapability("bulk_edit");
  const supabase = await createClient();
  const { error } = await supabase.from("spec_addons").update({ active: false }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/configurator");
  return { ok: true, message: "Add-on removed." };
}
