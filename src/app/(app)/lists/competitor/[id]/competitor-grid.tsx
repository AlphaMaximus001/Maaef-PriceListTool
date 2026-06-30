"use client";

import * as React from "react";
import { DataGrid, type ColDef } from "@/components/data-grid";
import { formatPrice } from "@/lib/utils";

export type CompetitorRow = {
  sku: string;
  product_name: string;
  category: string;
  price: number;
  currency: string;
};

export function CompetitorGrid({ rows }: { rows: CompetitorRow[] }) {
  const columnDefs = React.useMemo<ColDef<CompetitorRow>[]>(
    () => [
      { field: "sku", headerName: "SKU", flex: 0, width: 150 },
      { field: "product_name", headerName: "Product", flex: 2, minWidth: 220 },
      { field: "category", headerName: "Category", rowGroup: true, hide: true },
      {
        field: "price",
        headerName: "Price",
        type: "rightAligned",
        valueFormatter: (p) => formatPrice(p.value, p.data?.currency),
      },
    ],
    [],
  );

  return (
    <DataGrid<CompetitorRow>
      rowData={rows}
      columnDefs={columnDefs}
      groupDefaultExpanded={1}
      autoGroupColumnDef={{ headerName: "Category", minWidth: 220 }}
    />
  );
}
