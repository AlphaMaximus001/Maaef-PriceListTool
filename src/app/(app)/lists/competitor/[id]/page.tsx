import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { CompetitorGrid, type CompetitorRow } from "./competitor-grid";
import { ExportPdfButton } from "@/components/export-pdf-button";

export const dynamic = "force-dynamic";

export default async function CompetitorListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { can } = await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("competitor_lists")
    .select("id, name, uploaded_at, competitor_id, competitors(name)")
    .eq("id", id)
    .single();
  if (!list) notFound();

  const { data: items } = await supabase
    .from("competitor_items")
    .select("id, sku, product_name, category, price, currency")
    .eq("list_id", id)
    .order("category")
    .order("product_name");

  const rows: CompetitorRow[] = (items ?? []).map((i) => ({
    sku: i.sku ?? "—",
    product_name: i.product_name,
    category: i.category ?? "—",
    price: Number(i.price),
    currency: i.currency,
  }));

  const competitorName = (list.competitors as { name?: string } | null)?.name ?? "Competitor";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon">
              <Link href="/lists">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">{list.name}</h1>
            <Badge variant="muted">Read-only</Badge>
          </div>
          <p className="ml-10 mt-1 text-muted-foreground">
            {competitorName} · {rows.length} items · uploaded{" "}
            {new Date(list.uploaded_at).toLocaleDateString()}
          </p>
        </div>
        {can.export_pdf && (
          <ExportPdfButton href={`/api/export/competitor/${id}`} filename="maaef-competitor-list" />
        )}
      </div>

      <CompetitorGrid rows={rows} />
    </div>
  );
}
