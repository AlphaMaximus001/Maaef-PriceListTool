import Link from "next/link";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList } from "@/lib/lists";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { InfoTip } from "@/components/info-tip";
import { CustomizeClient, type CustomizeRow } from "./customize-client";

export const dynamic = "force-dynamic";

export default async function CustomizePage() {
  const { can } = await requireSession();

  if (!can.edit_specs) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-lg font-semibold">No access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Customizing SKUs needs the <code>edit_specs</code> capability. Ask an admin.
        </p>
      </div>
    );
  }

  const current = await getCurrentList();
  const supabase = await createClient();

  const { data: products } = current
    ? await supabase
        .from("my_products")
        .select("id, sku, product_name, display_name, category, price, currency")
        .eq("list_id", current.id)
        .eq("active", true)
        .order("category", { ascending: true })
        .order("product_name", { ascending: true })
    : { data: [] };

  const rows: CustomizeRow[] = (products ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    productName: p.product_name,
    displayName: p.display_name ?? null,
    category: p.category ?? null,
    price: Number(p.price),
    currency: p.currency,
  }));

  const categories = Array.from(new Set(rows.map((r) => r.category).filter(Boolean) as string[])).sort();
  const locked = !!current && (current.locked || current.is_original);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Customize SKUs <InfoTip k="customize.page" side="right" />
        </h1>
        <p className="mt-1 text-muted-foreground">
          Add new items and give SKUs a friendly display name. Everything saves to your current working
          version — the SKU code stays the same, and the Original is never touched.
        </p>
      </div>

      {!current ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No list yet — import your inventory from{" "}
            <Link href="/lists" className="text-maaef-red underline">Lists</Link> first.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Working in <span className="font-medium text-foreground">{current.name}</span>
            {locked ? (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> Locked — saving will create a version
              </Badge>
            ) : (
              <Badge>Editable version</Badge>
            )}
          </div>

          <CustomizeClient
            rows={rows}
            categories={categories}
            locked={locked}
            showCost={can.view_cost}
            currency={rows[0]?.currency ?? "INR"}
          />
        </>
      )}
    </div>
  );
}
