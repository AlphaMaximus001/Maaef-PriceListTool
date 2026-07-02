"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/capabilities";
import { parseWorkbook } from "@/lib/templates";
import { parseUnifiedWorkbook, DEFAULT_MY_BRAND } from "@/lib/unified";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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

/**
 * Unified inventory import — the wide, pre-matched Maaef format. One upload:
 *   - upserts my_products for rows with a Maaef rate (SKUs synthesized),
 *   - creates one snapshot list per competitor brand + their items,
 *   - links same-row overlaps as CONFIRMED matches (the row alignment is the
 *     human judgment), so the undercut radar populates immediately.
 * Competitor-only rows land in the market-gap view via having no match.
 */
export async function uploadUnifiedInventory(formData: FormData): Promise<UploadResult> {
  const session = await requireCapability("bulk_edit");
  if (!session.can.upload_competitor) {
    return { ok: false, message: "You also need the upload-competitor capability to import competitor rates." };
  }
  const supabase = await createClient();

  const file = formData.get("file");
  const myBrand = String(formData.get("my_brand") || DEFAULT_MY_BRAND).trim() || DEFAULT_MY_BRAND;
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };

  const parsed = parseUnifiedWorkbook(await file.arrayBuffer(), myBrand);
  if (!parsed.ok) {
    return { ok: false, message: "The file doesn't match the unified inventory format.", errors: parsed.errors };
  }

  const stamp = new Date();
  const archivePath = await archiveOriginal(supabase, file, "unified");

  // 1) Upsert my products (rows priced for the my-brand).
  const myUpserts = parsed.rows
    .filter((r) => r.myPrice !== null)
    .map((r) => ({
      sku: r.mySku,
      product_name: r.name,
      category: r.category,
      specs: r.specs,
      spec_key: r.spec_key,
      price: r.myPrice as number,
      currency: "INR",
      active: true,
    }));

  for (const c of chunk(myUpserts, 500)) {
    const { error } = await supabase.from("my_products").upsert(c, { onConflict: "sku" });
    if (error) return { ok: false, message: `Products import failed: ${error.message}` };
  }

  // Map my SKU -> id.
  const mySkuToId = new Map<string, string>();
  for (const c of chunk(myUpserts.map((u) => u.sku), 500)) {
    const { data } = await supabase.from("my_products").select("id, sku").in("sku", c);
    for (const p of data ?? []) mySkuToId.set(p.sku, p.id);
  }

  // 2) Per competitor brand: snapshot list + items, then confirmed matches.
  const matchRows: {
    my_product_id: string;
    competitor_item_id: string;
    confidence: number;
    method: "manual";
    confirmed: boolean;
    rejected: boolean;
    confirmed_by: string;
    confirmed_at: string;
  }[] = [];
  let competitorItemCount = 0;

  for (const brand of parsed.competitorBrands) {
    // Ensure the competitor exists.
    const { data: comp, error: compErr } = await supabase
      .from("competitors")
      .upsert({ name: brand }, { onConflict: "name" })
      .select("id")
      .single();
    if (compErr || !comp) return { ok: false, message: `Competitor "${brand}": ${compErr?.message}` };

    const brandRows = parsed.rows
      .map((r) => ({ r, cp: r.competitorPrices.find((c) => c.brand === brand) }))
      .filter((x) => x.cp);

    const { data: list, error: listErr } = await supabase
      .from("competitor_lists")
      .insert({
        competitor_id: comp.id,
        name: `${brand} — inventory ${stamp.toLocaleDateString("en-IN")}`,
        source_file: archivePath,
        row_count: brandRows.length,
      })
      .select("id")
      .single();
    if (listErr || !list) return { ok: false, message: `List for "${brand}": ${listErr?.message}` };

    const items = brandRows.map(({ r, cp }) => ({
      list_id: list.id,
      sku: cp!.sku,
      product_name: r.name,
      category: r.category,
      specs: r.specs,
      spec_key: r.spec_key,
      price: cp!.price,
      currency: "INR",
    }));
    for (const c of chunk(items, 500)) {
      const { error } = await supabase.from("competitor_items").insert(c);
      if (error) return { ok: false, message: `Items for "${brand}": ${error.message}` };
    }
    competitorItemCount += items.length;

    // Map this brand's item SKU -> id (SKUs are unique within the list).
    const itemSkuToId = new Map<string, string>();
    const { data: savedItems } = await supabase
      .from("competitor_items")
      .select("id, sku")
      .eq("list_id", list.id);
    for (const it of savedItems ?? []) if (it.sku) itemSkuToId.set(it.sku, it.id);

    // Confirmed matches for same-row overlaps (only where the my-brand is priced).
    for (const { r, cp } of brandRows) {
      if (r.myPrice === null) continue;
      const myId = mySkuToId.get(r.mySku);
      const itemId = itemSkuToId.get(cp!.sku);
      if (myId && itemId) {
        matchRows.push({
          my_product_id: myId,
          competitor_item_id: itemId,
          confidence: 1,
          method: "manual",
          confirmed: true,
          rejected: false,
          confirmed_by: session.profile.id,
          confirmed_at: stamp.toISOString(),
        });
      }
    }
  }

  for (const c of chunk(matchRows, 500)) {
    const { error } = await supabase
      .from("product_matches")
      .upsert(c, { onConflict: "my_product_id,competitor_item_id", ignoreDuplicates: true });
    if (error) return { ok: false, message: `Matches failed: ${error.message}` };
  }

  revalidatePath("/lists");
  revalidatePath("/lists/my");
  revalidatePath("/overlap");
  revalidatePath("/unique");
  revalidatePath("/market-gap");
  return {
    ok: true,
    message: `Imported ${myUpserts.length} Maaef products, ${competitorItemCount} competitor items, and ${matchRows.length} confirmed overlaps across ${parsed.competitorBrands.join(", ")}.`,
    warnings: parsed.warnings,
    inserted: myUpserts.length,
  };
}
