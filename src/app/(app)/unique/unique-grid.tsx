"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { DataGrid, type ColDef } from "@/components/data-grid";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";

export type UniqueRow = {
  my_sku: string;
  my_product_name: string;
  category: string;
  my_price: number;
  currency: string;
};

export function UniqueGrid({ rows }: { rows: UniqueRow[] }) {
  const [query, setQuery] = React.useState("");

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
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search SKU, product, or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <DataGrid<UniqueRow>
        rowData={rows}
        columnDefs={columnDefs}
        quickFilterText={query}
        groupDefaultExpanded={1}
        autoGroupColumnDef={{ headerName: "Category", minWidth: 220 }}
      />
    </div>
  );
}
