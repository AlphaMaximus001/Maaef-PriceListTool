"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requireCapability } from "@/lib/capabilities";
import { getCurrentList, LIST_COOKIE } from "@/lib/lists";
import type { EditInput, EditResult } from "./my/edit-actions";

export type ListActionResult = { ok: boolean; message: string; listId?: string };

/** Switch the working list (cookie), so every screen follows it. */
export async function selectList(listId: string): Promise<ListActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.from("price_lists").select("id").eq("id", listId).single();
  if (!data) return { ok: false, message: "That list no longer exists." };

  (await cookies()).set(LIST_COOKIE, listId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true, message: "Switched list.", listId };
}

async function createVersionFrom(sourceId: string, name: string): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_list_version", {
    p_source: sourceId,
    p_name: name,
  });
  if (error) return { error: error.message };
  return { id: data as string };
}

/** Create a new editable version from the current list, then switch to it. */
export async function createVersion(name: string): Promise<ListActionResult> {
  await requireCapability("edit_price");
  const current = await getCurrentList();
  if (!current) return { ok: false, message: "No list to copy yet." };
  if (!name.trim()) return { ok: false, message: "Give the new list a name." };

  const { id, error } = await createVersionFrom(current.id, name.trim());
  if (error || !id) return { ok: false, message: error ?? "Could not create the version." };

  (await cookies()).set(LIST_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true, message: `Created "${name.trim()}".`, listId: id };
}

/**
 * The "edit the locked original" flow: create a named version off the current
 * list, apply the pending edit inside it, and switch to it — so the original is
 * never touched. Single-scope targets are remapped by SKU into the new copy.
 */
export async function createVersionAndEdit(
  name: string,
  input: EditInput,
): Promise<{ ok: boolean; message: string; listId?: string; result?: EditResult }> {
  const session = await requireCapability(input.scope === "single" ? "edit_price" : "bulk_edit");
  const current = await getCurrentList();
  if (!current) return { ok: false, message: "No list to copy yet." };
  if (!name.trim()) return { ok: false, message: "Give the new list a name." };

  const { id: newId, error } = await createVersionFrom(current.id, name.trim());
  if (error || !newId) return { ok: false, message: error ?? "Could not create the version." };

  const supabase = await createClient();

  // Remap a single-product target: the copy has a new row id for the same SKU.
  let targetId = input.targetId ?? null;
  if (input.scope === "single" && input.targetId) {
    const { data: orig } = await supabase.from("my_products").select("sku").eq("id", input.targetId).single();
    if (orig) {
      const { data: copy } = await supabase
        .from("my_products")
        .select("id")
        .eq("list_id", newId)
        .eq("sku", orig.sku)
        .single();
      targetId = copy?.id ?? null;
    }
  }

  const { data, error: editErr } = await supabase.rpc("mutate_prices", {
    p_scope: input.scope,
    p_operation: input.operation,
    p_value: input.value,
    p_list_id: newId,
    p_target_id: targetId,
    p_target_category: input.targetCategory ?? null,
    p_confirm_below_floor: false,
    p_dry_run: false,
  });

  (await cookies()).set(LIST_COOKIE, newId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");

  if (editErr) {
    return { ok: true, message: `Created "${name.trim()}" (apply your edit again here).`, listId: newId };
  }
  // Touch to keep the linter aware `session` is used server-side.
  void session;
  return { ok: true, message: `Created "${name.trim()}" and applied your change.`, listId: newId, result: data as EditResult };
}

export async function renameList(listId: string, name: string): Promise<ListActionResult> {
  await requireCapability("edit_price");
  if (!name.trim()) return { ok: false, message: "Name can't be empty." };
  const supabase = await createClient();
  const { error } = await supabase.from("price_lists").update({ name: name.trim() }).eq("id", listId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Renamed." };
}
