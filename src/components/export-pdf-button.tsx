"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Downloads a branded PDF from the export route. Shows a spinner while
 * Playwright renders, and surfaces a 403 (missing export_pdf) cleanly.
 */
export function ExportPdfButton({
  href,
  filename,
  label = "Download PDF",
}: {
  href: string;
  filename: string;
  label?: string;
}) {
  const [loading, setLoading] = React.useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        toast.error(
          res.status === 403
            ? "You don't have permission to export PDFs."
            : `Export failed (${res.status}).`,
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't reach the export service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={download} disabled={loading}>
      <FileDown className="h-4 w-4" /> {loading ? "Preparing…" : label}
    </Button>
  );
}
