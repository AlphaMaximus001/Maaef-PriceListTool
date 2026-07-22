"use client";

import * as React from "react";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  colorSchemeLight,
  colorSchemeDark,
  type ColDef,
} from "ag-grid-community";

// AG Grid v36: register the Community modules once, app-wide.
ModuleRegistry.registerModules([AllCommunityModule]);

// Maaef-tinted Quartz theme (Theming API — no CSS import needed in v33+).
// Two variants so the grid follows the app's light/dark mode.
const maaefThemeLight = themeQuartz.withPart(colorSchemeLight).withParams({
  accentColor: "#8B0000",
  headerBackgroundColor: "#F4E1E4",
  headerTextColor: "#2B1B2E",
  fontFamily: "inherit",
  borderColor: "#e7d4d8",
});
const maaefThemeDark = themeQuartz.withPart(colorSchemeDark).withParams({
  accentColor: "#e06666",
  backgroundColor: "#1f1622",
  foregroundColor: "#f2ebee",
  headerBackgroundColor: "#2b2130",
  headerTextColor: "#f2ebee",
  fontFamily: "inherit",
  borderColor: "#3a2f40",
});

/** Tracks the app theme by watching the `.dark` class on <html>. */
function useIsDark(): boolean {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

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
  const dark = useIsDark();

  return (
    <div style={{ height, width: "100%" }}>
      <AgGridReact<T>
        theme={dark ? maaefThemeDark : maaefThemeLight}
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
