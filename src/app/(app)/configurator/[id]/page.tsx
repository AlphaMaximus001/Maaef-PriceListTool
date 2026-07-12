import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ConfiguratorClient, type ConfigAddon } from "./configurator-client";

export const dynamic = "force-dynamic";

export default async function SkuDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { can } = await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("my_products")
    .select("id, sku, product_name, category, specs, price, currency, config")
    .eq("id", id)
    .single();
  if (!product) notFound();

  // This product's own add-ons, plus any legacy category/global ones (product_id
  // null) that still apply to its category — kept for backward compatibility.
  const { data: addons } = await supabase
    .from("spec_addons")
    .select("id, name, applies_to, price_delta, currency, product_id")
    .eq("active", true)
    .or(`product_id.eq.${id},product_id.is.null`);

  const cat = (product.category ?? "").toLowerCase();
  const applicable: ConfigAddon[] = (addons ?? [])
    .filter((a) => a.product_id === id || !a.applies_to || a.applies_to.toLowerCase() === cat)
    .map((a) => ({
      id: a.id,
      name: a.name,
      price_delta: Number(a.price_delta),
      currency: a.currency,
      productScoped: a.product_id === id,
    }));

  const savedIds: string[] = Array.isArray((product.config as { addons?: string[] })?.addons)
    ? (product.config as { addons: string[] }).addons
    : [];

  // Base = current price minus the deltas of currently-saved, still-applicable
  // add-ons, so toggling is stable across repeat configurations.
  const applicableById = new Map(applicable.map((a) => [a.id, a]));
  const savedDelta = savedIds.reduce((sum, sid) => sum + (applicableById.get(sid)?.price_delta ?? 0), 0);
  const basePrice = Math.round((Number(product.price) - savedDelta) * 100) / 100;

  const specs = (product.specs as Record<string, string>) ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/configurator">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.product_name}</h1>
          <p className="text-sm text-muted-foreground">
            {product.sku} · {product.category ?? "—"}
          </p>
        </div>
      </div>

      <ConfiguratorClient
        productId={product.id}
        basePrice={basePrice}
        currency={product.currency}
        specs={specs}
        addons={applicable}
        savedIds={savedIds.filter((s) => applicableById.has(s))}
        canEdit={can.edit_price}
        canManageAddons={can.bulk_edit}
        canViewCost={can.view_cost}
      />
    </div>
  );
}
