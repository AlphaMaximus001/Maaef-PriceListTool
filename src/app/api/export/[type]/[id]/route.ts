import { NextResponse } from "next/server";
import { getSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList } from "@/lib/lists";
import { buildListHtml, type PdfItem, type PdfFooter } from "@/lib/pdf/template";
import { renderPdf } from "@/lib/pdf/render";

// Force Node runtime (Playwright needs it) and never cache a generated PDF.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "list";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  // Server-side capability gate (invariant 5 / §6) — never trust the client.
  if (!session.can.export_pdf) return new NextResponse("Forbidden", { status: 403 });

  const { type, id } = await params;
  const supabase = await createClient();

  // MUSP/MP are only included when explicitly requested AND the user may see them.
  const wantIntel = new URL(req.url).searchParams.get("intel") === "1";
  const showIntel = wantIntel && session.can.view_margin;

  let title = "";
  let subtitle = "Price list";
  let items: PdfItem[] = [];

  if (type === "my") {
    // Export the list the user is currently working in (its latest saved edits).
    const currentList = await getCurrentList();
    if (!currentList) return new NextResponse("No list", { status: 404 });
    const { data } = await supabase
      .from("my_products")
      .select("id, sku, product_name, display_name, category, price, currency")
      .eq("active", true)
      .eq("list_id", currentList.id)
      .order("category")
      .order("product_name");

    const intelById = new Map<string, { musp: number | null; mp: number | null }>();
    if (showIntel) {
      const { data: pi } = await supabase.rpc("pricing_intel", { p_list_id: currentList.id });
      for (const r of (pi as Array<{ product_id: string; musp: number | null; mp: number | null }>) ?? []) {
        intelById.set(r.product_id, { musp: r.musp != null ? Number(r.musp) : null, mp: r.mp != null ? Number(r.mp) : null });
      }
    }

    title = currentList.name;
    items = (data ?? []).map((p) => ({
      sku: p.sku,
      // Client-facing PDF shows the custom display alias when one is set.
      product_name: p.display_name || p.product_name,
      category: p.category,
      price: Number(p.price),
      currency: p.currency,
      musp: showIntel ? intelById.get(p.id)?.musp ?? null : undefined,
      mp: showIntel ? intelById.get(p.id)?.mp ?? null : undefined,
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

  // Employee footer — from the account generating the PDF.
  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, email, phone, signature_path")
    .eq("id", session.profile.id)
    .single();

  let signatureDataUri: string | null = null;
  if (me?.signature_path) {
    const { data: blob } = await supabase.storage.from("signatures").download(me.signature_path);
    if (blob) {
      const buf = Buffer.from(await blob.arrayBuffer());
      const mime = blob.type || "image/png";
      signatureDataUri = `data:${mime};base64,${buf.toString("base64")}`;
    }
  }

  const footer: PdfFooter = {
    name: me?.full_name || session.profile.full_name || session.profile.email,
    email: me?.email || session.profile.email,
    phone: me?.phone ?? null,
    signatureDataUri,
  };

  const html = buildListHtml({ title, subtitle, items, generatedAt: new Date(), showIntel, footer });

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
