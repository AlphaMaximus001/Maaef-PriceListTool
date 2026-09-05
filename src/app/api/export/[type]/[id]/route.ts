import { NextResponse } from "next/server";
import { getSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getCurrentList, getAllListProducts, PAGE_SIZE } from "@/lib/lists";
import { buildListHtml, buildFooterTemplate, type PdfItem, type PdfFooter } from "@/lib/pdf/template";
import { renderPdf } from "@/lib/pdf/render";
import { buildCatalogueHtml, type CatalogueItem } from "@/lib/pdf/catalogue";
import { renderCataloguePdf } from "@/lib/pdf/catalogue-render";
import {
  buildCatalogueWorkbook,
  buildListWorkbook,
  XLSX_CONTENT_TYPE,
} from "@/lib/xlsx-export";

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

  // PDF unless the caller asked for the spreadsheet.
  const asXlsx = new URL(req.url).searchParams.get("format") === "xlsx";

  // ── Branded catalogue: fixed cover pages + computed index + priced pages ────
  if (type === "catalogue") {
    const currentList = await getCurrentList();
    if (!currentList) return new NextResponse("No list", { status: 404 });

    type Raw = {
      sku: string; product_name: string; display_name: string | null;
      category: string | null; specs: Record<string, string> | null; price: number; currency: string;
    };
    const products = await getAllListProducts<Raw>(
      currentList.id,
      "id, sku, product_name, display_name, category, specs, price, currency",
    );

    // Order by the category number encoded in the SKU (C1, C2, …) then serial,
    // so the catalogue and its index follow the same order as the grid.
    const catOrder = (sku: string) => { const m = /C(\d+)-/i.exec(sku); return m ? parseInt(m[1], 10) : 1e9; };
    const serial = (sku: string) => { const m = /C\d+-(\d+)/i.exec(sku); return m ? parseInt(m[1], 10) : 1e9; };
    products.sort((a, b) => catOrder(a.sku) - catOrder(b.sku) || serial(a.sku) - serial(b.sku) || a.product_name.localeCompare(b.product_name));

    const catItems: CatalogueItem[] = products.map((p) => ({
      name: p.display_name || p.product_name,
      category: p.category ?? "Other",
      pagesLeaves: p.specs?.pages || p.specs?.unit || "",
      price: Number(p.price),
      currency: p.currency,
    }));

    // Spreadsheet flavour: same rows and order, no cover pages or branding.
    // Deliberately does NOT record a PDF code — that code is stamped on printed
    // pages, and counting a spreadsheet would skew each employee's PDF counter.
    if (asXlsx) {
      const buf = buildCatalogueWorkbook(catItems, currentList.name);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": XLSX_CONTENT_TYPE,
          "Content-Disposition": `attachment; filename="maaef-catalogue-${slug(currentList.name)}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Traceability code: the employee's fixed ID + a per-employee PDF counter,
    // derived and recorded server-side (see 0023_employee_id_scheme.sql).
    const { data: codeData } = await supabase.rpc("record_pdf_export", {
      p_list_id: currentList.id,
      p_list_name: currentList.name,
    });
    const code = (codeData as string) ?? "";

    try {
      const pdf = await renderCataloguePdf(buildCatalogueHtml(catItems, code));
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="maaef-catalogue-${slug(currentList.name)}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      return new NextResponse(`Catalogue export failed: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
    }
  }

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
    // All products (paginated — a single request caps at 1000), ordered by the
    // category number encoded in the SKU (C1, C2, …) then serial, so the PDF
    // matches the on-screen grid order.
    type RawProduct = {
      id: string; sku: string; product_name: string; display_name: string | null;
      category: string | null; price: number; currency: string;
    };
    const catOrder = (sku: string) => {
      const m = /C(\d+)-/i.exec(sku);
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    };
    const serial = (sku: string) => {
      const m = /C\d+-(\d+)/i.exec(sku);
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    };
    const data = (await getAllListProducts<RawProduct>(currentList.id)).sort(
      (a, b) => catOrder(a.sku) - catOrder(b.sku) || serial(a.sku) - serial(b.sku) || a.product_name.localeCompare(b.product_name),
    );

    const intelById = new Map<string, { musp: number | null; mp: number | null }>();
    if (showIntel) {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: pi } = await supabase
          .rpc("pricing_intel", { p_list_id: currentList.id })
          .range(from, from + PAGE_SIZE - 1);
        const batch = (pi as Array<{ product_id: string; musp: number | null; mp: number | null }>) ?? [];
        if (batch.length === 0) break;
        for (const r of batch) {
          intelById.set(r.product_id, { musp: r.musp != null ? Number(r.musp) : null, mp: r.mp != null ? Number(r.mp) : null });
        }
        if (batch.length < PAGE_SIZE) break;
      }
    }

    title = currentList.name;
    items = data.map((p) => ({
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

  // Spreadsheet flavour of a plain list — no branding, no employee footer.
  if (asXlsx) {
    const buf = buildListWorkbook(items, title, showIntel);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="maaef-${slug(title)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
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

  const html = buildListHtml({ title, subtitle, items, generatedAt: new Date(), showIntel });
  const footerTemplate = buildFooterTemplate(footer);

  try {
    const pdf = await renderPdf(html, { footerTemplate });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        // `inline` so opening the URL previews in the browser's PDF viewer;
        // the Download button still forces a save with the right filename.
        "Content-Disposition": `inline; filename="maaef-${slug(title)}.pdf"`,
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
