"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/capabilities";
import { parseWorkbook } from "@/lib/templates";

export type UploadResult = {
  ok: boolean;
  message: string;
  errors?: string[];
  warnings?: string[];
  inserted?: number;
};

async function archiveOriginal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: File,
  folder: string,
): Promise<string | null> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `${folder}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage
    .from("intake-archives")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) return null;
  return path;
}

/**
 * F1 — upload a competitor price list. Parses the competitor template, archives
 * the original, and writes competitor_items under a named list. Competitor data
 * is write-once (invariant 3): we only insert.
 */
export async function uploadCompetitorList(formData: FormData): Promise<UploadResult> {
  await requireCapability("upload_competitor");
  const supabase = await createClient();

  const file = formData.get("file");
  const listName = String(formData.get("list_name") || "").trim();
  const competitorId = String(formData.get("competitor_id") || "").trim();
  const newCompetitor = String(formData.get("competitor_name") || "").trim();

  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };
  if (!listName) return { ok: false, message: "Give the list a name." };
  if (!competitorId && !newCompetitor) return { ok: false, message: "Pick or name a competitor." };

  const parsed = parseWorkbook(await file.arrayBuffer(), "competitor", { includeCost: false });
  if (!parsed.ok) {
    return { ok: false, message: "The file doesn't match the competitor template.", errors: parsed.errors };
  }

  // Resolve / create the competitor.
  let compId = competitorId;
  if (!compId) {
    const { data, error } = await supabase
      .from("competitors")
      .insert({ name: newCompetitor })
      .select("id")
      .single();
    if (error || !data) return { ok: false, message: `Could not create competitor: ${error?.message}` };
    compId = data.id;
  }

  const archivePath = await archiveOriginal(supabase, file, `competitor/${compId}`);

  const { data: list, error: listErr } = await supabase
    .from("competitor_lists")
    .insert({
      competitor_id: compId,
      name: listName,
      source_file: archivePath,
      row_count: parsed.rows.length,
    })
    .select("id")
    .single();
  if (listErr || !list) return { ok: false, message: `Could not create list: ${listErr?.message}` };

  const items = parsed.rows.map((r) => ({
    list_id: list.id,
    sku: r.sku,
    product_name: r.product_name,
    category: r.category,
    specs: r.specs,
    spec_key: r.spec_key,
    price: r.price,
    currency: r.currency,
  }));
  const { error: itemsErr } = await supabase.from("competitor_items").insert(items);
  if (itemsErr) return { ok: false, message: `Rows failed to import: ${itemsErr.message}` };

  revalidatePath("/lists");
  return {
    ok: true,
    message: `Imported ${items.length} rows into "${listName}".`,
    warnings: parsed.warnings,
    inserted: items.length,
  };
}

/**
 * F1/Phase-2 — import the Maaef product list. Upserts my_products by SKU. Price
 * changes to existing SKUs are logged to price_edits (invariant 4). Cost is only
 * imported when the uploader has view_cost (invariant 1).
 */
export async function uploadMyProducts(formData: FormData): Promise<UploadResult> {
  const session = await requireCapability("bulk_edit");
  const supabase = await createClient();
  const canCost = session.can.view_cost;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };

  const parsed = parseWorkbook(await file.arrayBuffer(), "my_products", { includeCost: canCost });
  if (!parsed.ok) {
    return { ok: false, message: "The file doesn't match the Maaef products template.", errors: parsed.errors };
  }

  await archiveOriginal(supabase, file, "my-products");

  // Existing prices, to log changes.
  const skus = parsed.rows.map((r) => r.sku!).filter(Boolean);
  const { data: existing } = await supabase
    .from("my_products")
    .select("id, sku, price")
    .in("sku", skus);
  const bySku = new Map((existing ?? []).map((p) => [p.sku, p]));

  const upserts = parsed.rows.map((r) => ({
    sku: r.sku,
    product_name: r.product_name,
    category: r.category,
    specs: r.specs,
    spec_key: r.spec_key,
    price: r.price,
    currency: r.currency,
  }));
  const { data: saved, error } = await supabase
    .from("my_products")
    .upsert(upserts, { onConflict: "sku" })
    .select("id, sku, price");
  if (error) return { ok: false, message: `Import failed: ${error.message}` };

  const savedBySku = new Map((saved ?? []).map((p) => [p.sku, p]));

  // Audit log for price changes on rows that already existed.
  const batchId = crypto.randomUUID();
  const edits: {
    product_id: string;
    old_price: number;
    new_price: number;
    operation: "set";
    scope: "list";
    batch_id: string;
    actor: string;
    note: string;
  }[] = [];
  for (const r of parsed.rows) {
    const prev = bySku.get(r.sku!);
    if (prev && Number(prev.price) !== r.price) {
      edits.push({
        product_id: prev.id,
        old_price: Number(prev.price),
        new_price: r.price,
        operation: "set",
        scope: "list",
        batch_id: batchId,
        actor: session.profile.id,
        note: "Imported from spreadsheet",
      });
    }
  }
  if (edits.length) await supabase.from("price_edits").insert(edits);

  // Costs (only when permitted).
  if (canCost) {
    const costRows = parsed.rows
      .filter((r) => r.cost != null)
      .map((r) => ({
        product_id: savedBySku.get(r.sku!)?.id,
        cost: r.cost!,
        currency: r.currency,
        updated_by: session.profile.id,
      }))
      .filter((c) => c.product_id);
    if (costRows.length) await supabase.from("product_costs").upsert(costRows, { onConflict: "product_id" });
  }

  revalidatePath("/lists");
  revalidatePath("/lists/my");
  return {
    ok: true,
    message: `Imported ${upserts.length} products${edits.length ? ` (${edits.length} price changes logged)` : ""}.`,
    warnings: parsed.warnings,
    inserted: upserts.length,
  };
}
