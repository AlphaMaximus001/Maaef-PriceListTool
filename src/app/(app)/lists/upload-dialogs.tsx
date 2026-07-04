"use client";

import * as React from "react";
import { toast } from "sonner";
import { Upload, Download } from "lucide-react";
import {
  uploadCompetitorList,
  uploadMyProducts,
  uploadUnifiedInventory,
  type UploadResult,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTip } from "@/components/info-tip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function ResultNotes({ result }: { result: UploadResult | null }) {
  if (!result) return null;
  return (
    <div className="space-y-2 text-sm">
      {result.errors?.length ? (
        <ul className="list-disc space-y-1 rounded-md bg-destructive/10 p-3 pl-6 text-destructive">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}
      {result.warnings?.length ? (
        <ul className="max-h-32 list-disc space-y-1 overflow-auto rounded-md bg-muted p-3 pl-6 text-muted-foreground">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function UploadUnifiedDialog() {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<UploadResult | null>(null);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <div className="flex items-center gap-1.5">
        <DialogTrigger asChild>
          <Button>
            <Upload className="h-4 w-4" /> Import inventory
          </Button>
        </DialogTrigger>
        <InfoTip k="lists.importUnified" side="bottom" />
      </div>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const r = await uploadUnifiedInventory(fd);
              setResult(r);
              if (r.ok) {
                toast.success(r.message);
                setOpen(false);
              } else toast.error(r.message);
            })
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Import unified inventory <InfoTip k="lists.importUnified" />
            </DialogTitle>
            <DialogDescription>
              One wide sheet with your rate and each competitor&apos;s rate per row
              (e.g. Maaef / Smas / Chandra). Creates your products, each competitor
              list, and confirms the overlaps in one pass.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <a
              href="/api/templates/unified"
              className="inline-flex items-center gap-1.5 text-sm text-maaef-red hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Download the unified template
            </a>
            <div className="space-y-2">
              <Label htmlFor="my-brand" className="flex items-center gap-1.5">
                Your brand column <InfoTip k="upload.myBrand" />
              </Label>
              <Input id="my-brand" name="my_brand" defaultValue="Maaef" />
              <p className="text-xs text-muted-foreground">
                The <code>&lt;brand&gt; Rate</code> column that is yours. Every other
                <code> Rate</code> column is treated as a competitor.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="uni-file">Spreadsheet (.xlsx)</Label>
              <Input id="uni-file" name="file" type="file" accept=".xlsx,.xls,.csv" required />
            </div>
            <ResultNotes result={result} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Importing…" : "Import inventory"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UploadMyProductsDialog() {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<UploadResult | null>(null);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <div className="flex items-center gap-1.5">
        <DialogTrigger asChild>
          <Button variant="outline">
            <Upload className="h-4 w-4" /> Import my list
          </Button>
        </DialogTrigger>
        <InfoTip k="lists.importMy" side="bottom" />
      </div>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const r = await uploadMyProducts(fd);
              setResult(r);
              if (r.ok) {
                toast.success(r.message);
                setOpen(false);
              } else toast.error(r.message);
            })
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Import Maaef products <InfoTip k="lists.importMy" />
            </DialogTitle>
            <DialogDescription>
              Upserts by SKU. Price changes to existing products are logged. Cost is
              only imported if you can view cost.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <a
              href="/api/templates/my_products"
              className="inline-flex items-center gap-1.5 text-sm text-maaef-red hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Download the products template
            </a>
            <div className="space-y-2">
              <Label htmlFor="my-file">Spreadsheet (.xlsx)</Label>
              <Input id="my-file" name="file" type="file" accept=".xlsx,.xls,.csv" required />
            </div>
            <ResultNotes result={result} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UploadCompetitorDialog({
  competitors,
}: {
  competitors: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [result, setResult] = React.useState<UploadResult | null>(null);
  const [competitorId, setCompetitorId] = React.useState<string>("");

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <div className="flex items-center gap-1.5">
        <DialogTrigger asChild>
          <Button>
            <Upload className="h-4 w-4" /> Upload competitor list
          </Button>
        </DialogTrigger>
        <InfoTip k="lists.uploadCompetitor" side="bottom" />
      </div>
      <DialogContent>
        <form
          action={(fd) =>
            start(async () => {
              const r = await uploadCompetitorList(fd);
              setResult(r);
              if (r.ok) {
                toast.success(r.message);
                setOpen(false);
              } else toast.error(r.message);
            })
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Upload competitor list <InfoTip k="lists.uploadCompetitor" />
            </DialogTitle>
            <DialogDescription>
              Reference data — imported once, never edited in-app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <a
              href="/api/templates/competitor"
              className="inline-flex items-center gap-1.5 text-sm text-maaef-red hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Download the competitor template
            </a>
            <div className="space-y-2">
              <Label>Competitor</Label>
              <Select value={competitorId} onValueChange={setCompetitorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Existing competitor (or add new below)" />
                </SelectTrigger>
                <SelectContent>
                  {competitors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="competitor_id" value={competitorId} />
              <Input
                name="competitor_name"
                placeholder="…or new competitor name"
                disabled={!!competitorId}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="list-name">List name</Label>
              <Input id="list-name" name="list_name" placeholder="e.g. Rival Co — 2026 catalogue" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="comp-file">Spreadsheet (.xlsx)</Label>
              <Input id="comp-file" name="file" type="file" accept=".xlsx,.xls,.csv" required />
            </div>
            <ResultNotes result={result} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
