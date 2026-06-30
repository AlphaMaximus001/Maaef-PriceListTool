"use client";

import * as React from "react";
import { DataGrid, type ColDef } from "@/components/data-grid";
import { formatPrice } from "@/lib/utils";

export type MyProductRow = {
  id: string;
  sku: string;
  product_name: string;
  category: string;
  price: number;
  currency: string;
  // undefined = not permitted to see cost; null = no cost set.
  cost?: number | null;
};

export function MyProductsGrid({
  rows,
  showCost,
}: {
  rows: MyProductRow[];
  showCost: boolean;
}) {
  const columnDefs = React.useMemo<ColDef<MyProductRow>[]>(() => {
    const cols: ColDef<MyProductRow>[] = [
      { field: "sku", headerName: "SKU", minWidth: 130, flex: 0, width: 150 },
      { field: "product_name", headerName: "Product", minWidth: 220, flex: 2 },
      { field: "category", headerName: "Category", rowGroup: true, hide: true },
      {
        field: "price",
        headerName: "Price",
        type: "rightAligned",
        valueFormatter: (p) => formatPrice(p.value, p.data?.currency),
      },
    ];
    // Cost column only exists when permitted (invariant 1).
    if (showCost) {
      cols.push({
        field: "cost",
        headerName: "Cost (private)",
        type: "rightAligned",
        cellStyle: { color: "#8B0000" },
        valueFormatter: (p) =>
          p.value == null ? "—" : formatPrice(p.value, p.data?.currency),
      });
    }
    return cols;
  }, [showCost]);

  return (
    <DataGrid<MyProductRow>
      rowData={rows}
      columnDefs={columnDefs}
      groupDefaultExpanded={1}
      autoGroupColumnDef={{ headerName: "Category", minWidth: 220 }}
    />
  );
}
