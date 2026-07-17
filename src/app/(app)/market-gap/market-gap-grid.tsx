"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { DataGrid, type ColDef } from "@/components/data-grid";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";

export type MarketGapRow = {
  product_name: string;
  category: string;
  competitor_name: string;
  competitor_price: number;
  currency: string;
};

export function MarketGapGrid({ rows }: { rows: MarketGapRow[] }) {
  const [query, setQuery] = React.useState("");

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
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search product, category, or competitor…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <DataGrid<MarketGapRow>
        rowData={rows}
        columnDefs={columnDefs}
        quickFilterText={query}
        groupDefaultExpanded={1}
        autoGroupColumnDef={{ headerName: "Category", minWidth: 240 }}
      />
    </div>
  );
}
