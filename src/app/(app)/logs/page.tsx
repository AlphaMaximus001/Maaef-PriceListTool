import { getSession } from "@/lib/capabilities";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InfoTip } from "@/components/info-tip";

export const dynamic = "force-dynamic";

type Actor = { full_name: string | null; email: string } | null;
type Prod = { sku: string; product_name: string; display_name: string | null } | null;

type LogEntry = {
  id: string;
  at: string;
  actor: string;
  product: string | null;
  action: string;
  detail: string;
  tone: "price" | "field" | "flag" | "create";
};

function who(a: Actor): string {
  return a?.full_name || a?.email || "—";
}
function prodLabel(p: Prod): string | null {
  if (!p) return null;
  return `${p.display_name || p.product_name} · ${p.sku}`;
}

export default async function ActionLogsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.can.manage_users) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-lg font-semibold">No access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Action logs need the <code>manage_users</code> capability.
        </p>
      </div>
    );
  }
  const canCost = session.can.view_cost;
  const supabase = await createClient();

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

  const entries: LogEntry[] = [];

  for (const r of (priceRows as unknown as Array<{ id: string; old_price: number; new_price: number; operation: string; scope: string; created_at: string; my_products: Prod; profiles: Actor }>) ?? []) {
    entries.push({
      id: `pe-${r.id}`,
      at: r.created_at,
      actor: who(r.profiles),
      product: prodLabel(r.my_products),
      action: "Price change",
      detail: `${r.old_price} → ${r.new_price} (${r.operation}, ${r.scope})`,
      tone: "price",
    });
  }

  for (const r of (changeRows as unknown as Array<{ id: string; field: string; old_value: unknown; new_value: unknown; created_at: string; my_products: Prod; profiles: Actor }>) ?? []) {
    const isSecret = r.field === "cost" || r.field === "margin";
    let detail: string;
    if (r.field === "created") {
      detail = "New item added";
    } else if (isSecret && !canCost) {
      detail = "updated (private)";
    } else {
      const fmt = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
      detail = `${fmt(r.old_value)} → ${fmt(r.new_value)}`;
    }
    entries.push({
      id: `cl-${r.id}`,
      at: r.created_at,
      actor: who(r.profiles),
      product: prodLabel(r.my_products),
      action: r.field === "created" ? "Item created" : `Edit: ${r.field.replace("_", " ")}`,
      detail,
      tone: r.field === "created" ? "create" : "field",
    });
  }

  for (const r of (flagRows as unknown as Array<{ id: string; reason: string; created_at: string; resolved: boolean; resolved_at: string | null; my_products: Prod; creator: Actor; resolver: Actor }>) ?? []) {
    entries.push({
      id: `fl-${r.id}`,
      at: r.created_at,
      actor: who(r.creator),
      product: prodLabel(r.my_products),
      action: "Flag raised",
      detail: r.reason,
      tone: "flag",
    });
    if (r.resolved && r.resolved_at) {
      entries.push({
        id: `flr-${r.id}`,
        at: r.resolved_at,
        actor: who(r.resolver),
        product: prodLabel(r.my_products),
        action: "Flag resolved",
        detail: r.reason,
        tone: "flag",
      });
    }
  }

  entries.sort((a, b) => b.at.localeCompare(a.at));
  const top = entries.slice(0, 400);

  const toneClass: Record<LogEntry["tone"], string> = {
    price: "bg-maaef-red/10 text-maaef-red",
    field: "bg-muted text-foreground/70",
    flag: "bg-amber-100 text-amber-800",
    create: "bg-green-100 text-green-800",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Action logs <InfoTip k="logs.page" side="right" />
        </h1>
        <p className="mt-1 text-muted-foreground">
          Who changed what, and when — price edits, product edits, item creation, and flag activity
          across all lists. Read-only.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No activity yet.
                    </TableCell>
                  </TableRow>
                )}
                {top.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(e.at).toLocaleString()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{e.actor}</TableCell>
                    <TableCell>
                      <Badge variant="muted" className={toneClass[e.tone]}>{e.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{e.product ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-foreground/80" title={e.detail}>
                      {e.detail}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
