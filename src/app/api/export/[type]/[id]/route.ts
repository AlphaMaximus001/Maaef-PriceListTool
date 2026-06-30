import { NextResponse } from "next/server";
import { getSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { buildListHtml, type PdfItem } from "@/lib/pdf/template";
import { renderPdf } from "@/lib/pdf/render";

// Force Node runtime (Playwright needs it) and never cache a generated PDF.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "list";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  // Server-side capability gate (invariant 5 / §6) — never trust the client.
  if (!session.can.export_pdf) return new NextResponse("Forbidden", { status: 403 });

  const { type, id } = await params;
  const supabase = await createClient();

  let title = "";
  let subtitle = "Price list";
  let items: PdfItem[] = [];

  if (type === "my") {
    // Reflects the latest saved edits (current my_products).
    const { data } = await supabase
      .from("my_products")
      .select("sku, product_name, category, price, currency")
      .eq("active", true)
      .order("category")
      .order("product_name");
    title = "Maaef products";
    items = (data ?? []).map((p) => ({
      sku: p.sku,
      product_name: p.product_name,
      category: p.category,
      price: Number(p.price),
      currency: p.currency,
    }));
  } else if (type === "competitor") {
    const { data: list } = await supabase
      .from("competitor_lists")
      .select("name, competitors(name)")
      .eq("id", id)
      .single();
    if (!list) return new NextResponse("Not found", { status: 404 });
    const { data } = await supabase
      .from("competitor_items")
      .select("sku, product_name, category, price, currency")
      .eq("list_id", id)
      .order("category")
      .order("product_name");
    title = list.name;
    subtitle = (list.competitors as { name?: string } | null)?.name ?? "Competitor";
    items = (data ?? []).map((p) => ({
      sku: p.sku,
      product_name: p.product_name,
      category: p.category,
      price: Number(p.price),
      currency: p.currency,
    }));
  } else {
    return new NextResponse("Unknown export type", { status: 404 });
  }

  const html = buildListHtml({ title, subtitle, items, generatedAt: new Date() });

  try {
    const pdf = await renderPdf(html);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="maaef-${slug(title)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new NextResponse(
      `PDF generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      { status: 500 },
    );
  }
}
