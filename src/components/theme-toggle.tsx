"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Light/dark toggle. The theme is applied before paint by the inline script in
 * the root layout (reads `maaef-theme` from localStorage, falling back to the
 * OS preference). This button just flips the `.dark` class on <html> and
 * persists the choice. Renders a stable icon on the server (dark = null) so
 * there's no hydration mismatch; the real state is read after mount.
 */
export function ThemeToggle() {
  const [dark, setDark] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("maaef-theme", next ? "dark" : "light");
    } catch {
      /* private mode / storage disabled — theme still applies for this session */
    }
    setDark(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
