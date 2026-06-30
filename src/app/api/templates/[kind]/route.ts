import { NextResponse } from "next/server";
import { buildTemplateWorkbook, type TemplateKind } from "@/lib/templates";
import { getSession } from "@/lib/capabilities";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { kind } = await params;
  if (kind !== "my_products" && kind !== "competitor") {
    return new NextResponse("Unknown template", { status: 404 });
  }

  const buf = buildTemplateWorkbook(kind as TemplateKind);
  const filename = kind === "my_products" ? "maaef-products-template.xlsx" : "competitor-list-template.xlsx";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
