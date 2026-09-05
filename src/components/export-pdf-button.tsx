"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileDown, Eye, FileText, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Mode = "download" | "preview";
type Format = "pdf" | "xlsx";

/**
 * Download a price list as either the branded PDF or a plain Excel workbook.
 *
 * Preview (opening in a new tab) only applies to the PDF — a spreadsheet has
 * nothing to preview in the browser, so that button is hidden for Excel.
 * When `canIntel` is set (view_margin) the dialog also offers the MUSP/MP
 * columns, which carry through to whichever format is chosen.
 */
export function ExportPdfButton({
  href,
  filename,
  label = "Download",
  canIntel = false,
}: {
  href: string;
  filename: string;
  label?: string;
  canIntel?: boolean;
}) {
  const [loading, setLoading] = React.useState(false);
  const [dialog, setDialog] = React.useState(false);
  const [includeIntel, setIncludeIntel] = React.useState(false);
  const [format, setFormat] = React.useState<Format>("pdf");

  // Swap the extension so the saved file matches the chosen format.
  const nameFor = (f: Format) => filename.replace(/\.(pdf|xlsx)$/i, "") + (f === "pdf" ? ".pdf" : ".xlsx");

  const run = async (withIntel: boolean, mode: Mode, f: Format) => {
    setDialog(false);
    setLoading(true);
    // For preview, open the tab NOW (inside the click gesture) so pop-up
    // blockers don't kill it; we point it at the PDF once the fetch resolves.
    const previewWin = mode === "preview" ? window.open("", "_blank") : null;
    try {
      const params = new URLSearchParams();
      if (withIntel) params.set("intel", "1");
      if (f === "xlsx") params.set("format", "xlsx");
      const qs = params.toString();
      const url = qs ? `${href}${href.includes("?") ? "&" : "?"}${qs}` : href;

      const res = await fetch(url);
      if (!res.ok) {
        previewWin?.close();
        if (res.status === 403) {
          toast.error("You don't have permission to export price lists.");
          return;
        }
        const reason = (await res.text().catch(() => "")).trim();
        const hint = /executable doesn't exist|playwright|browsertype/i.test(reason)
          ? "The PDF engine (Chromium) isn't installed. Run: npx playwright install chromium"
          : reason || `Export failed (${res.status}).`;
        toast.error(hint, { duration: 8000 });
        return;
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      if (mode === "preview") {
        if (previewWin) previewWin.location.href = objUrl;
        else window.open(objUrl, "_blank"); // fallback if the tab was blocked
        // Keep the object alive long enough for the new tab to load it.
        setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
      } else {
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = nameFor(f);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      }
    } catch {
      previewWin?.close();
      toast.error("Couldn't reach the export service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" disabled={loading} onClick={() => setDialog(true)}>
        <FileDown className="h-4 w-4" /> {loading ? "Preparing…" : label}
      </Button>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download price list</DialogTitle>
            <DialogDescription>Pick a file format, then download.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-2">
              <FormatCard
                active={format === "pdf"}
                onClick={() => setFormat("pdf")}
                icon={<FileText className="h-5 w-5" />}
                title="PDF"
                note="Branded booklet, ready to print or send to a client."
              />
              <FormatCard
                active={format === "xlsx"}
                onClick={() => setFormat("xlsx")}
                icon={<FileSpreadsheet className="h-5 w-5" />}
                title="Excel"
                note="Plain spreadsheet you can sort, filter, and edit."
              />
            </div>

            {canIntel && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="intel" className="flex flex-col">
                  <span>Include MUSP &amp; MP columns</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Internal pricing intelligence. Leave off for a client-facing list.
                  </span>
                </Label>
                <Switch id="intel" checked={includeIntel} onCheckedChange={setIncludeIntel} />
              </div>
            )}
          </div>

          <DialogFooter>
            {/* Only a PDF has something to preview in the browser. */}
            {format === "pdf" && (
              <Button variant="outline" onClick={() => run(includeIntel, "preview", "pdf")}>
                <Eye className="h-4 w-4" /> Preview
              </Button>
            )}
            <Button onClick={() => run(includeIntel, "download", format)}>
              <FileDown className="h-4 w-4" />
              Download {format === "pdf" ? "PDF" : "Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormatCard({
  active,
  onClick,
  icon,
  title,
  note,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-maaef-red bg-maaef-red/5 ring-1 ring-maaef-red"
          : "hover:bg-muted/50",
      )}
    >
      <span className={cn("flex items-center gap-2 font-medium", active && "text-maaef-red")}>
        {icon} {title}
      </span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </button>
  );
}
