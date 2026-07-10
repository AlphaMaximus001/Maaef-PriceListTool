import Link from "next/link";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList } from "@/lib/lists";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flag, CheckCircle2, ArrowRight } from "lucide-react";
import { InfoTip } from "@/components/info-tip";

export const dynamic = "force-dynamic";

type FlagJoin = {
  id: string;
  reason: string;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  my_products: { sku: string; product_name: string; display_name: string | null; category: string | null } | null;
  creator: { email: string; full_name: string | null } | null;
  resolver: { email: string; full_name: string | null } | null;
};

function who(p: { email: string; full_name: string | null } | null): string {
  return p?.full_name || p?.email || "—";
}

function label(mp: FlagJoin["my_products"]): string {
  if (!mp) return "—";
  return mp.display_name || mp.product_name;
}

export default async function FlagHistoryPage() {
  await requireSession();
  const current = await getCurrentList();
  const supabase = await createClient();

  const { data } = current
    ? await supabase
        .from("flags")
        .select(
          "id, reason, created_at, resolved, resolved_at, " +
            "my_products(sku, product_name, display_name, category), " +
            "creator:profiles!flags_created_by_fkey(email, full_name), " +
            "resolver:profiles!flags_resolved_by_fkey(email, full_name)",
        )
        .eq("list_id", current.id)
        .order("created_at", { ascending: false })
    : { data: [] as unknown };

  const flags = (data as unknown as FlagJoin[]) ?? [];
  const open = flags.filter((f) => !f.resolved);
  const resolved = flags.filter((f) => f.resolved);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Flag history <InfoTip k="flags.page" side="right" />
        </h1>
        <p className="mt-1 text-muted-foreground">
          Every flag raised on <span className="font-medium">{current?.name ?? "this list"}</span>. Resolved
          flags stay here as a training record — what was caught, by whom, and how it was closed.
        </p>
      </div>

      {/* Open flags */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Flag className="h-4 w-4 text-maaef-red" /> Open ({open.length})
        </h2>
        {open.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nothing open. All clear.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {open.map((f) => (
              <Card key={f.id} className="border-maaef-red/30">
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {label(f.my_products)}
                      {f.my_products && (
                        <Badge variant="muted" className="font-mono text-xs">{f.my_products.sku}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-foreground/80">{f.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Flagged by {who(f.creator)} · {new Date(f.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge className="bg-maaef-red text-white">Open</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Resolved — training history */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-600" /> Resolved ({resolved.length})
        </h2>
        {resolved.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No resolved flags yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {resolved.map((f) => (
              <Card key={f.id}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-2 font-medium">
                    {label(f.my_products)}
                    {f.my_products && (
                      <Badge variant="muted" className="font-mono text-xs">{f.my_products.sku}</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-foreground/80">{f.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Flagged by {who(f.creator)} · {new Date(f.created_at).toLocaleDateString()}
                    {" → "}
                    Resolved by {who(f.resolver)}
                    {f.resolved_at ? ` · ${new Date(f.resolved_at).toLocaleDateString()}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="bg-muted/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Raise or resolve a flag</CardTitle>
          <CardDescription>
            Flags are raised and resolved from a product&apos;s detail panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/lists/my" className="inline-flex items-center gap-1 text-sm text-maaef-red hover:underline">
            Open the product grid <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
