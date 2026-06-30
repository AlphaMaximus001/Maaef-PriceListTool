"use client";

import * as React from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  colorSchemeLight,
  type ColDef,
} from "ag-grid-community";

// AG Grid v36: register the Community modules once, app-wide.
ModuleRegistry.registerModules([AllCommunityModule]);

// Maaef-tinted Quartz theme (Theming API — no CSS import needed in v33+).
const maaefTheme = themeQuartz.withPart(colorSchemeLight).withParams({
  accentColor: "#8B0000",
  headerBackgroundColor: "#F4E1E4",
  headerTextColor: "#2B1B2E",
  fontFamily: "inherit",
  borderColor: "#e7d4d8",
});

export type { ColDef };

/**
 * Thin wrapper around AgGridReact with the Maaef theme and sane defaults.
 * Used for the my-list grid, competitor grids, and overlap tables.
 */
export function DataGrid<T>({
  rowData,
  columnDefs,
  height = 560,
  ...rest
}: {
  rowData: T[];
  columnDefs: ColDef<T>[];
  height?: number | string;
} & Omit<AgGridReactProps<T>, "rowData" | "columnDefs" | "theme">) {
  const defaultColDef = React.useMemo<ColDef<T>>(
    () => ({ sortable: true, resizable: true, filter: true, flex: 1, minWidth: 110 }),
    [],
  );

  return (
    <div style={{ height, width: "100%" }}>
      <AgGridReact<T>
        theme={maaefTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        animateRows
        suppressCellFocus={rest.onCellValueChanged === undefined}
        {...rest}
      />
    </div>
  );
}
