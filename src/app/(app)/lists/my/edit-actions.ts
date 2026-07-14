"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/capabilities";
import { getCurrentList } from "@/lib/lists";

function mapError(msg: string): string {
  if (msg.includes("LIST_LOCKED")) {
    return "This list is locked. Create a working version to edit it.";
  }
  return msg;
}

export type EditScope = "single" | "category" | "list" | "selection";
export type EditOperation = "percentage" | "flat" | "set" | "undercut_lowest";

export type EditInput = {
  scope: EditScope;
  operation: EditOperation;
  value: number;
  targetId?: string | null;
  targetCategory?: string | null;
  targetIds?: string[] | null;
};

export type Breach = {
  product_id: string;
  old_price: number;
  new_price: number;
  floor: number;
};

export type ChangeRow = {
  sku: string;
  name: string;
  category: string | null;
  old: number;
  new: number;
  breaches: boolean;
};

export type EditResult = {
  status: "preview" | "needs_confirm" | "applied" | "error";
  message?: string;
  affected?: number;
  changed?: number;
  would_apply?: number;
  applied?: number;
  blocked?: number;
  breach_count?: number;
  breaches?: Breach[]; // only present for view_cost users
  changes?: ChangeRow[]; // per-product old -> new (capped), for the preview
  batch_id?: string;
  can_view_cost?: boolean;
};

function validate(input: EditInput): string | null {
  if (!["single", "category", "list", "selection"].includes(input.scope)) return "Invalid scope.";
  if (!["percentage", "flat", "set", "undercut_lowest"].includes(input.operation)) return "Invalid operation.";
  if (!Number.isFinite(input.value)) return "Enter a numeric value.";
  if (input.operation === "set" && input.value < 0) return "Set value can't be negative.";
  if (input.scope === "single" && !input.targetId) return "No product selected.";
  if (input.scope === "category" && !input.targetCategory) return "No category selected.";
  if (input.scope === "selection" && !(input.targetIds && input.targetIds.length))
    return "Tick at least one product.";
  return null;
}

async function callMutate(input: EditInput, confirm: boolean, dryRun: boolean): Promise<EditResult> {
  // Capability is enforced again inside the DB function; we gate early too.
  await requireCapability(input.scope === "single" ? "edit_price" : "bulk_edit");
  const err = validate(input);
  if (err) return { status: "error", message: err };

  const current = await getCurrentList();
  if (!current) return { status: "error", message: "No list selected." };
  if (current.locked || current.is_original) {
    return { status: "error", message: "This list is locked. Create a working version to edit it." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mutate_prices", {
    p_scope: input.scope,
    p_operation: input.operation,
    p_value: input.value,
    p_list_id: current.id,
    p_target_id: input.targetId ?? null,
    p_target_category: input.targetCategory ?? null,
    p_target_ids: input.targetIds ?? null,
    p_confirm_below_floor: confirm,
    p_dry_run: dryRun,
  });
  if (error) return { status: "error", message: mapError(error.message) };
  return data as EditResult;
}

/** Dry run — what would change, how many breach the floor. No writes. */
export async function previewEdit(input: EditInput): Promise<EditResult> {
  return callMutate(input, false, true);
}

/**
 * Apply. For a view_cost user, a below-floor change comes back as
 * needs_confirm until `confirm` is true (invariant 6). For a non-view_cost
 * user, below-floor rows are silently blocked by the DB function.
 */
export async function applyEdit(input: EditInput, confirm: boolean): Promise<EditResult> {
  const result = await callMutate(input, confirm, false);
  if (result.status === "applied") {
    revalidatePath("/lists/my");
    revalidatePath("/overlap");
    revalidatePath("/history");
  }
  return result;
}

export async function undoEdit(editId: string): Promise<{ ok: boolean; message: string }> {
  await requireCapability("edit_price");
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_price_edit", { p_edit_id: editId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/history");
  revalidatePath("/lists/my");
  revalidatePath("/overlap");
  return { ok: true, message: "Edit undone." };
}

export async function undoBatch(batchId: string): Promise<{ ok: boolean; message: string }> {
  await requireCapability("bulk_edit");
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_price_batch", { p_batch_id: batchId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/history");
  revalidatePath("/lists/my");
  revalidatePath("/overlap");
  return { ok: true, message: "Batch undone." };
}
