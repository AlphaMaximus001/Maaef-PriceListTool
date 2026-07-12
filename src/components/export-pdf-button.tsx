"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileDown, Eye } from "lucide-react";
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

/**
 * Preview or download a branded PDF from the export route. Preview opens the
 * PDF in a new browser tab (where the built-in viewer has its own download
 * button); Download saves the file directly. When `canIntel` is set
 * (view_margin), first asks whether to include the MUSP/MP columns.
 */
export function ExportPdfButton({
  href,
  filename,
  label = "PDF",
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

  const run = async (withIntel: boolean, mode: Mode) => {
    setDialog(false);
    setLoading(true);
    // For preview, open the tab NOW (inside the click gesture) so pop-up
    // blockers don't kill it; we point it at the PDF once the fetch resolves.
    const previewWin = mode === "preview" ? window.open("", "_blank") : null;
    try {
      const url = withIntel ? `${href}${href.includes("?") ? "&" : "?"}intel=1` : href;
      const res = await fetch(url);
      if (!res.ok) {
        previewWin?.close();
        if (res.status === 403) {
          toast.error("You don't have permission to export PDFs.");
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
        a.download = filename;
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

  // Admins choosing intel go through the dialog; everyone else gets the two
  // buttons directly.
  if (canIntel) {
    return (
      <>
        <Button variant="outline" disabled={loading} onClick={() => setDialog(true)}>
          <FileDown className="h-4 w-4" /> {loading ? "Preparing…" : label}
        </Button>
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Export options</DialogTitle>
              <DialogDescription>Choose what to include, then preview or download.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="intel" className="flex flex-col">
                <span>Include MUSP &amp; MP columns</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Internal pricing intelligence. Leave off for a client-facing list.
                </span>
              </Label>
              <Switch id="intel" checked={includeIntel} onCheckedChange={setIncludeIntel} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => run(includeIntel, "preview")}>
                <Eye className="h-4 w-4" /> Preview
              </Button>
              <Button onClick={() => run(includeIntel, "download")}>
                <FileDown className="h-4 w-4" /> Download
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" disabled={loading} onClick={() => run(false, "preview")}>
        <Eye className="h-4 w-4" /> Preview
      </Button>
      <Button variant="outline" disabled={loading} onClick={() => run(false, "download")}>
        <FileDown className="h-4 w-4" /> {loading ? "Preparing…" : "Download"}
      </Button>
    </div>
  );
}
