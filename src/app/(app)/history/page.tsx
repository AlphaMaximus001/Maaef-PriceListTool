import { redirect } from "next/navigation";
import { getSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList } from "@/lib/lists";
import { HistoryClient, type EditRow } from "./history-client";

export const dynamic = "force-dynamic";

type JoinedEdit = {
  id: string;
  product_id: string;
  old_price: number;
  new_price: number;
  operation: string;
  scope: string;
  batch_id: string | null;
  reverted: boolean;
  note: string | null;
  created_at: string;
  actor: string | null;
  my_products: { sku: string; product_name: string; currency: string } | null;
  profiles: { full_name: string | null; email: string } | null;
};

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const currentList = await getCurrentList();
  const { data } = currentList
    ? await supabase
        .from("price_edits")
        .select(
          "id, product_id, old_price, new_price, operation, scope, batch_id, reverted, note, created_at, actor, my_products!inner(sku, product_name, currency, list_id), profiles!price_edits_actor_fkey(full_name, email)",
        )
        .eq("my_products.list_id", currentList.id)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };

  const rows: EditRow[] = ((data as unknown as JoinedEdit[]) ?? []).map((e) => ({
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

  const canUndoSingle = session.can.edit_price;
  const canUndoBatch = session.can.bulk_edit;
  const listLocked = !currentList || currentList.locked || currentList.is_original;

  return (
    <HistoryClient
      rows={rows}
      canUndoSingle={canUndoSingle}
      canUndoBatch={canUndoBatch}
      canRestore={canUndoBatch && !listLocked}
      listName={currentList?.name ?? ""}
    />
  );
}
