import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList } from "@/lib/lists";
import { LogsTabs, type LogEntry, type HistoryProps } from "./logs-tabs";
import { type EditRow } from "../history/history-client";

export const dynamic = "force-dynamic";

type Actor = { full_name: string | null; email: string } | null;
type Prod = { sku: string; product_name: string; display_name: string | null } | null;

const who = (a: Actor) => a?.full_name || a?.email || "—";
const prodLabel = (p: Prod) => (p ? `${p.display_name || p.product_name} · ${p.sku}` : null);

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireSession();
  const supabase = await createClient();
  const currentList = await getCurrentList();
  const tab = (await searchParams).tab;
  const isAdmin = session.can.manage_users;
  const canCost = session.can.view_cost;

  // ── Edit history for the current list (everyone) ────────────────────────────
  const { data: editData } = currentList
    ? await supabase
        .from("price_edits")
        .select(
          "id, product_id, old_price, new_price, operation, scope, batch_id, reverted, note, created_at, actor, my_products!inner(sku, product_name, currency, list_id), profiles!price_edits_actor_fkey(full_name, email)",
        )
        .eq("my_products.list_id", currentList.id)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };

  const historyRows: EditRow[] = ((editData as unknown as Array<{
    id: string; old_price: number; new_price: number; operation: string; scope: string;
    batch_id: string | null; reverted: boolean; note: string | null; created_at: string;
    my_products: { sku: string; product_name: string; currency: string } | null;
    profiles: { full_name: string | null; email: string } | null;
  }>) ?? []).map((e) => ({
    id: e.id,
    sku: e.my_products?.sku ?? "—",
    productName: e.my_products?.product_name ?? "—",
    currency: e.my_products?.currency ?? "INR",
    oldPrice: Number(e.old_price),
    newPrice: Number(e.new_price),
    operation: e.operation,
    scope: e.scope,
    batchId: e.batch_id,
    reverted: e.reverted,
    note: e.note,
    createdAt: e.created_at,
    actor: e.profiles?.full_name || e.profiles?.email || "—",
  }));

  const listLocked = !currentList || currentList.locked || currentList.is_original;
  const history: HistoryProps = {
    rows: historyRows,
    canUndoSingle: session.can.edit_price,
    canUndoBatch: session.can.bulk_edit,
    canRestore: session.can.bulk_edit && !listLocked,
    listName: currentList?.name ?? "",
  };

  // ── All-lists activity audit (admins only) ──────────────────────────────────
  const activity: LogEntry[] = [];
  if (isAdmin) {
    const [{ data: priceRows }, { data: changeRows }, { data: flagRows }] = await Promise.all([
      supabase
        .from("price_edits")
        .select("id, old_price, new_price, operation, scope, created_at, my_products(sku, product_name, display_name), profiles!price_edits_actor_fkey(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(250),
      supabase
        .from("product_change_log")
        .select("id, field, old_value, new_value, created_at, my_products(sku, product_name, display_name), profiles(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(250),
      supabase
        .from("flags")
        .select("id, reason, created_at, resolved, resolved_at, my_products(sku, product_name, display_name), creator:profiles!flags_created_by_fkey(full_name, email), resolver:profiles!flags_resolved_by_fkey(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(150),
    ]);

    for (const r of (priceRows as unknown as Array<{ id: string; old_price: number; new_price: number; operation: string; scope: string; created_at: string; my_products: Prod; profiles: Actor }>) ?? []) {
      activity.push({ id: `pe-${r.id}`, at: r.created_at, actor: who(r.profiles), product: prodLabel(r.my_products), action: "Price change", detail: `${r.old_price} → ${r.new_price} (${r.operation}, ${r.scope})`, tone: "price" });
    }
    for (const r of (changeRows as unknown as Array<{ id: string; field: string; old_value: unknown; new_value: unknown; created_at: string; my_products: Prod; profiles: Actor }>) ?? []) {
      const isSecret = r.field === "cost" || r.field === "margin";
      let detail: string;
      if (r.field === "created") detail = "New item added";
      else if (isSecret && !canCost) detail = "updated (private)";
      else { const fmt = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)); detail = `${fmt(r.old_value)} → ${fmt(r.new_value)}`; }
      activity.push({ id: `cl-${r.id}`, at: r.created_at, actor: who(r.profiles), product: prodLabel(r.my_products), action: r.field === "created" ? "Item created" : `Edit: ${r.field.replace("_", " ")}`, detail, tone: r.field === "created" ? "create" : "field" });
    }
    for (const r of (flagRows as unknown as Array<{ id: string; reason: string; created_at: string; resolved: boolean; resolved_at: string | null; my_products: Prod; creator: Actor; resolver: Actor }>) ?? []) {
      activity.push({ id: `fl-${r.id}`, at: r.created_at, actor: who(r.creator), product: prodLabel(r.my_products), action: "Flag raised", detail: r.reason, tone: "flag" });
      if (r.resolved && r.resolved_at) activity.push({ id: `flr-${r.id}`, at: r.resolved_at, actor: who(r.resolver), product: prodLabel(r.my_products), action: "Flag resolved", detail: r.reason, tone: "flag" });
    }
    activity.sort((a, b) => b.at.localeCompare(a.at));
  }

  const defaultTab = tab === "history" ? "history" : isAdmin ? "activity" : "history";

  return (
    <LogsTabs isAdmin={isAdmin} activity={activity.slice(0, 400)} history={history} defaultTab={defaultTab} />
  );
}
