"use client";

import * as React from "react";
import { DataGrid, type ColDef } from "@/components/data-grid";
import { formatPrice } from "@/lib/utils";
import type { CellValueChangedEvent, SelectionChangedEvent } from "ag-grid-community";

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
  editable = false,
  onSelectionChanged,
  onPriceEdit,
}: {
  rows: MyProductRow[];
  showCost: boolean;
  editable?: boolean;
  onSelectionChanged?: (selectedIds: string[]) => void;
  onPriceEdit?: (id: string, newPrice: number, revert: () => void) => void;
}) {
  const columnDefs = React.useMemo<ColDef<MyProductRow>[]>(() => {
    const cols: ColDef<MyProductRow>[] = [
      {
        field: "sku",
        headerName: "SKU",
        minWidth: 130,
        flex: 0,
        width: 160,
        checkboxSelection: editable,
        headerCheckboxSelection: false,
      },
      { field: "product_name", headerName: "Product", minWidth: 220, flex: 2 },
      { field: "category", headerName: "Category", rowGroup: true, hide: true },
      {
        field: "price",
        headerName: "Price",
        type: "rightAligned",
        editable,
        valueFormatter: (p) => formatPrice(p.value, p.data?.currency),
        cellStyle: editable ? { cursor: "text" } : undefined,
      },
    ];
    if (showCost) {
      cols.push({
        field: "cost",
        headerName: "Cost (private)",
        type: "rightAligned",
        editable: false,
        cellStyle: { color: "#8B0000" },
        valueFormatter: (p) => (p.value == null ? "—" : formatPrice(p.value, p.data?.currency)),
      });
    }
    return cols;
  }, [showCost, editable]);

  const handleCellChanged = (e: CellValueChangedEvent<MyProductRow>) => {
    if (e.colDef.field !== "price" || !onPriceEdit) return;
    const newPrice = Number(e.newValue);
    const oldPrice = Number(e.oldValue);
    if (!Number.isFinite(newPrice) || newPrice === oldPrice) {
      e.node.setDataValue("price", oldPrice);
      return;
    }
    onPriceEdit(e.data.id, newPrice, () => e.node.setDataValue("price", oldPrice));
  };

  const handleSelection = (e: SelectionChangedEvent<MyProductRow>) => {
    if (!onSelectionChanged) return;
    onSelectionChanged(e.api.getSelectedRows().map((r) => r.id));
  };

  return (
    <DataGrid<MyProductRow>
      rowData={rows}
      columnDefs={columnDefs}
      groupDefaultExpanded={1}
      autoGroupColumnDef={{ headerName: "Category", minWidth: 220 }}
      rowSelection={editable ? "multiple" : undefined}
      suppressRowClickSelection
      onCellValueChanged={handleCellChanged}
      onSelectionChanged={handleSelection}
    />
  );
}
