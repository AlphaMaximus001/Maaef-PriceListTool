"use client";

import * as React from "react";
import { DataGrid, type ColDef } from "@/components/data-grid";
import { formatPrice } from "@/lib/utils";
import type { CellValueChangedEvent } from "ag-grid-community";

export type OverlapRow = {
  my_product_id: string;
  my_sku: string;
  my_product_name: string;
  category: string;
  my_price: number;
  currency: string;
  competitors: Record<string, number>; // competitor name -> best price
  lowest_competitor_price: number;
  lowest_competitor_name: string;
  gap: number; // my_price - lowest (positive = pricier)
  i_am_cheapest: boolean;
};

export function OverlapGrid({
  rows,
  competitorNames,
  editable = false,
  quickFilterText,
  onPriceEdit,
}: {
  rows: OverlapRow[];
  competitorNames: string[];
  editable?: boolean;
  quickFilterText?: string;
  onPriceEdit?: (id: string, newPrice: number, revert: () => void) => void;
}) {
  const columnDefs = React.useMemo<ColDef<OverlapRow>[]>(() => {
    const cols: ColDef<OverlapRow>[] = [
      { field: "my_sku", headerName: "SKU", flex: 0, width: 140, pinned: "left" },
      { field: "my_product_name", headerName: "Product", flex: 2, minWidth: 200, pinned: "left" },
      { field: "category", headerName: "Category", minWidth: 130 },
      {
        field: "my_price",
        headerName: editable ? "My price ✎" : "My price",
        headerTooltip: editable ? "Double-click to change this price" : undefined,
        type: "rightAligned",
        editable,
        cellStyle: editable ? { fontWeight: 600, cursor: "text" } : { fontWeight: 600 },
        valueFormatter: (p) => formatPrice(p.value, p.data?.currency),
      },
    ];

    // One column per competitor; green when you're cheaper than them.
    for (const name of competitorNames) {
      cols.push({
        headerName: name,
        type: "rightAligned",
        minWidth: 120,
        valueGetter: (p) => p.data?.competitors[name] ?? null,
        valueFormatter: (p) => (p.value == null ? "—" : formatPrice(p.value, p.data?.currency)),
        cellStyle: (p) => {
          if (p.value == null || !p.data) return null;
          return p.data.my_price <= p.value
            ? { color: "#15803d" } // you're cheaper than this competitor
            : { color: "#b91c1c" }; // pricier
        },
      });
    }

    cols.push(
      {
        headerName: "Lowest comp.",
        type: "rightAligned",
        minWidth: 140,
        valueGetter: (p) => p.data?.lowest_competitor_price ?? null,
        valueFormatter: (p) =>
          p.value == null ? "—" : `${formatPrice(p.value, p.data?.currency)}`,
        tooltipValueGetter: (p) => p.data?.lowest_competitor_name ?? "",
      },
      {
        field: "gap",
        headerName: "Gap",
        type: "rightAligned",
        minWidth: 120,
        sort: "desc",
        valueFormatter: (p) =>
          p.value === 0 ? "—" : `${p.value > 0 ? "+" : ""}${formatPrice(p.value, p.data?.currency)}`,
        cellStyle: (p) =>
          p.value > 0
            ? { color: "#b91c1c", fontWeight: 600 }
            : { color: "#15803d", fontWeight: 400 },
      },
      {
        field: "i_am_cheapest",
        headerName: "Status",
        minWidth: 130,
        cellRenderer: (p: { value: boolean }) =>
          p.value ? "✓ Cheapest" : "Undercut target",
        cellStyle: (p) =>
          p.value
            ? { color: "#15803d", fontWeight: 600 }
            : { color: "#b91c1c", fontWeight: 400 },
      },
    );
    return cols;
  }, [competitorNames, editable]);

  const handleCellChanged = (e: CellValueChangedEvent<OverlapRow>) => {
    if (e.colDef.field !== "my_price" || !onPriceEdit || !e.data) return;
    const newPrice = Number(e.newValue);
    const oldPrice = Number(e.oldValue);
    if (!Number.isFinite(newPrice) || newPrice === oldPrice) {
      e.node.setDataValue("my_price", oldPrice);
      return;
    }
    onPriceEdit(e.data.my_product_id, newPrice, () => e.node.setDataValue("my_price", oldPrice));
  };

  return (
    <DataGrid<OverlapRow>
      rowData={rows}
      columnDefs={columnDefs}
      enableBrowserTooltips
      quickFilterText={quickFilterText}
      onCellValueChanged={handleCellChanged}
    />
  );
}
