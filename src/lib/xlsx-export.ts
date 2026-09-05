import * as XLSX from "xlsx";

/**
 * Excel (.xlsx) export of a price list — the spreadsheet alternative to the
 * branded PDF. Same data, same order, no branding: a plain table people can
 * sort, filter, and paste into their own sheets.
 *
 * Cost is never included. MUSP/MP appear only when the caller explicitly asked
 * AND holds view_margin — the route decides that, not this module.
 */

export type SheetRow = Record<string, string | number | null>;

/** Column widths from the widest cell, so nothing lands as `####`. */
function autoFit(rows: SheetRow[], headers: string[]) {
  return headers.map((h) => {
    const longest = rows.reduce(
      (max, r) => Math.max(max, String(r[h] ?? "").length),
      h.length,
    );
    return { wch: Math.min(Math.max(longest + 2, 10), 60) };
  });
}

function toWorkbook(rows: SheetRow[], headers: string[], sheetName: string): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws["!cols"] = autoFit(rows, headers);
  // Freeze the header row so it stays put while scrolling a long list.
  ws["!freeze"] = { xSplit: "0", ySplit: "1", topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Price list");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export type CatalogueSheetItem = {
  name: string;
  category: string;
  pagesLeaves: string;
  price: number;
  currency: string;
};

/**
 * The catalogue as a spreadsheet: the same columns the printed booklet uses,
 * plus Category so the rows stay meaningful once they're out of the layout.
 * S.No restarts per category, exactly as it does in the PDF.
 */
export function buildCatalogueWorkbook(items: CatalogueSheetItem[], listName: string): Buffer {
  const headers = ["Category", "S.No", "Item Description", "Pages/Leaves", "Rate", "Currency"];
  let lastCategory: string | null = null;
  let n = 0;
  const rows: SheetRow[] = items.map((it) => {
    if (it.category !== lastCategory) {
      lastCategory = it.category;
      n = 0;
    }
    n += 1;
    return {
      Category: it.category,
      "S.No": n,
      "Item Description": it.name,
      "Pages/Leaves": it.pagesLeaves || "",
      Rate: it.price,
      Currency: it.currency,
    };
  });
  return toWorkbook(rows, headers, listName);
}

export type ListSheetItem = {
  sku: string | null; // competitor rows may have no code
  product_name: string;
  category: string | null;
  price: number;
  currency: string;
  musp?: number | null;
  mp?: number | null;
};

/** A plain list export (your list or a competitor's). */
export function buildListWorkbook(
  items: ListSheetItem[],
  listName: string,
  showIntel: boolean,
): Buffer {
  const headers = ["SKU", "Product Name", "Category", "Price", "Currency"];
  if (showIntel) headers.push("MUSP", "MP");

  const rows: SheetRow[] = items.map((p) => {
    const row: SheetRow = {
      SKU: p.sku ?? "",
      "Product Name": p.product_name,
      Category: p.category ?? "",
      Price: p.price,
      Currency: p.currency,
    };
    if (showIntel) {
      row.MUSP = p.musp ?? null;
      row.MP = p.mp ?? null;
    }
    return row;
  });
  return toWorkbook(rows, headers, listName);
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
