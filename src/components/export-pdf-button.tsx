"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
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

/**
 * Downloads a branded PDF from the export route. Shows a spinner while
 * Playwright renders, and surfaces the server's reason on failure. When
 * `canIntel` is set (view_margin), first asks whether to include MUSP/MP.
 */
export function ExportPdfButton({
  href,
  filename,
  label = "Download PDF",
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

  const run = async (withIntel: boolean) => {
    setDialog(false);
    setLoading(true);
    try {
      const url = withIntel ? `${href}${href.includes("?") ? "&" : "?"}intel=1` : href;
      const res = await fetch(url);
      if (!res.ok) {
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
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      toast.error("Couldn't reach the export service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        disabled={loading}
        onClick={() => (canIntel ? setDialog(true) : run(false))}
      >
        <FileDown className="h-4 w-4" /> {loading ? "Preparing…" : label}
      </Button>

      {canIntel && (
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Export options</DialogTitle>
              <DialogDescription>Choose what to include in the PDF.</DialogDescription>
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
              <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
              <Button onClick={() => run(includeIntel)}>Download</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
