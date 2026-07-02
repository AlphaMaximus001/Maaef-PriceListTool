import { NextResponse } from "next/server";
import { buildTemplateWorkbook, type TemplateKind } from "@/lib/templates";
import { buildUnifiedTemplate } from "@/lib/unified";
import { getSession } from "@/lib/capabilities";

const FILENAMES: Record<string, string> = {
  my_products: "maaef-products-template.xlsx",
  competitor: "competitor-list-template.xlsx",
  unified: "maaef-unified-inventory-template.xlsx",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { kind } = await params;
  if (!(kind in FILENAMES)) {
    return new NextResponse("Unknown template", { status: 404 });
  }

  const buf =
    kind === "unified" ? buildUnifiedTemplate() : buildTemplateWorkbook(kind as TemplateKind);
  const filename = FILENAMES[kind];

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
