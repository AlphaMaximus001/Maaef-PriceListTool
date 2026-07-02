"use client";

import * as React from "react";
import { DataGrid, type ColDef } from "@/components/data-grid";
import { formatPrice } from "@/lib/utils";

export type MarketGapRow = {
  product_name: string;
  category: string;
  competitor_name: string;
  competitor_price: number;
  currency: string;
};

export function MarketGapGrid({ rows }: { rows: MarketGapRow[] }) {
  const columnDefs = React.useMemo<ColDef<MarketGapRow>[]>(
    () => [
      { field: "product_name", headerName: "Product", flex: 2, minWidth: 240 },
      { field: "category", headerName: "Category", rowGroup: true, hide: true },
      { field: "competitor_name", headerName: "Competitor", minWidth: 140 },
      {
        field: "competitor_price",
        headerName: "Their price",
        type: "rightAligned",
        valueFormatter: (p) => formatPrice(p.value, p.data?.currency),
      },
    ],
    [],
  );

  return (
    <DataGrid<MarketGapRow>
      rowData={rows}
      columnDefs={columnDefs}
      groupDefaultExpanded={1}
      autoGroupColumnDef={{ headerName: "Category", minWidth: 240 }}
    />
  );
}
