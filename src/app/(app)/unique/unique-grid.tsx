"use client";

import * as React from "react";
import { DataGrid, type ColDef } from "@/components/data-grid";
import { formatPrice } from "@/lib/utils";

export type UniqueRow = {
  my_sku: string;
  my_product_name: string;
  category: string;
  my_price: number;
  currency: string;
};

export function UniqueGrid({ rows }: { rows: UniqueRow[] }) {
  const columnDefs = React.useMemo<ColDef<UniqueRow>[]>(
    () => [
      { field: "my_sku", headerName: "SKU", flex: 0, width: 150 },
      { field: "my_product_name", headerName: "Product", flex: 2, minWidth: 220 },
      { field: "category", headerName: "Category", rowGroup: true, hide: true },
      {
        field: "my_price",
        headerName: "Price",
        type: "rightAligned",
        valueFormatter: (p) => formatPrice(p.value, p.data?.currency),
      },
    ],
    [],
  );

  return (
    <DataGrid<UniqueRow>
      rowData={rows}
      columnDefs={columnDefs}
      groupDefaultExpanded={1}
      autoGroupColumnDef={{ headerName: "Category", minWidth: 220 }}
    />
  );
}
