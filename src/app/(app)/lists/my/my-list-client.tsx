"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, AlertTriangle } from "lucide-react";
import { Lock } from "lucide-react";
import type { PriceList } from "@/lib/lists";
import { MyProductsGrid, type MyProductRow } from "./my-grid";
import {
  previewEdit,
  applyEdit,
  type EditInput,
  type EditResult,
  type EditScope,
  type EditOperation,
} from "./edit-actions";
import { createVersionAndEdit } from "../list-actions";
import { ListVersionBar } from "./list-version-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/utils";

export function MyListClient({
  rows,
  categories,
  showCost,
  canEditSingle,
  canBulk,
  currentList,
  lists,
  locked,
}: {
  rows: MyProductRow[];
  categories: string[];
  showCost: boolean;
  canEditSingle: boolean;
  canBulk: boolean;
  currentList: PriceList;
  lists: PriceList[];
  locked: boolean;
}) {
  const router = useRouter();
  const editable = canEditSingle || canBulk;

  // When the current list is locked, an edit doesn't apply — it opens a dialog
  // to name a new version, which is created with the edit applied.
  const [versionEdit, setVersionEdit] = React.useState<EditInput | null>(null);
  const [versionName, setVersionName] = React.useState("");

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [scope, setScope] = React.useState<EditScope>(canBulk ? "category" : "single");
  const [operation, setOperation] = React.useState<EditOperation>("percentage");
  const [value, setValue] = React.useState("");
  const [category, setCategory] = React.useState(categories[0] ?? "");

  // "Jump to category" view filter — independent of the edit-scope category.
  const [viewCategory, setViewCategory] = React.useState<string>("all");
  const visibleRows = React.useMemo(
    () => (viewCategory === "all" ? rows : rows.filter((r) => r.category === viewCategory)),
    [rows, viewCategory],
  );

  const [pending, start] = React.useTransition();
  const [preview, setPreview] = React.useState<EditResult | null>(null);
  const [pendingInput, setPendingInput] = React.useState<EditInput | null>(null);
  const [revertFn, setRevertFn] = React.useState<(() => void) | null>(null);

  const buildInput = (): EditInput | string => {
    const v = Number(value);
    if (!Number.isFinite(v)) return "Enter a numeric value.";
    if (scope === "single") {
      if (selectedIds.length !== 1) return "Select exactly one product (tick a row) for a single edit.";
      return { scope, operation, value: v, targetId: selectedIds[0] };
    }
    if (scope === "category") return { scope, operation, value: v, targetCategory: category };
    return { scope, operation, value: v };
  };

  // Locked list: any edit becomes "name a new version" instead of applying.
  const openVersionPrompt = (input: EditInput) => {
    setVersionName(`${currentList.name} — copy`);
    setVersionEdit(input);
  };

  const runPreview = () => {
    const input = buildInput();
    if (typeof input === "string") {
      toast.error(input);
      return;
    }
    if (locked) {
      openVersionPrompt(input);
      return;
    }
    setRevertFn(null);
    start(async () => {
      const r = await previewEdit(input);
      if (r.status === "error") {
        toast.error(r.message ?? "Couldn't preview.");
        return;
      }
      setPendingInput(input);
      setPreview(r);
    });
  };

  // Inline price edit -> preview-then-confirm via the same dialog.
  const handleInlineEdit = (id: string, newPrice: number, revert: () => void) => {
    const input: EditInput = { scope: "single", operation: "set", value: newPrice, targetId: id };
    if (locked) {
      revert(); // don't change the locked list's cell; capture the intent instead
      openVersionPrompt(input);
      return;
    }
    setRevertFn(() => revert);
    start(async () => {
      const r = await previewEdit(input);
      if (r.status === "error") {
        toast.error(r.message ?? "Couldn't preview.");
        revert();
        return;
      }
      setPendingInput(input);
      setPreview(r);
    });
  };

  const commitVersion = () => {
    if (!versionEdit) return;
    start(async () => {
      const r = await createVersionAndEdit(versionName, versionEdit);
      if (r.ok) {
        toast.success(r.message);
        setVersionEdit(null);
        router.refresh();
      } else {
        toast.error(r.message);
      }
    });
  };

  const commit = (confirm: boolean) => {
    if (!pendingInput) return;
    start(async () => {
      const r = await applyEdit(pendingInput, confirm);
      if (r.status === "applied") {
        const parts = [`Applied ${r.applied ?? 0}`];
        if (r.blocked) parts.push(`${r.blocked} blocked below the allowed floor`);
        toast.success(parts.join(" · "));
        close();
        router.refresh();
      } else if (r.status === "needs_confirm") {
        // Re-show with breach detail (view_cost path).
        setPreview(r);
      } else {
        toast.error(r.message ?? "Couldn't apply.");
        revertFn?.();
        close();
      }
    });
  };

  const close = () => {
    setPreview(null);
    setPendingInput(null);
    setRevertFn(null);
  };

  const hasBreaches = (preview?.breach_count ?? 0) > 0;
  const blockedSilently = hasBreaches && !showCost; // non-view_cost: rows will be blocked

  return (
    <div className="space-y-4">
      <ListVersionBar lists={lists} currentList={currentList} canEdit={editable} />

      {editable && locked && (
        <div className="flex items-center gap-2 rounded-md border border-maaef-red/30 bg-maaef-red/5 px-4 py-3 text-sm text-maaef-purple">
          <Lock className="h-4 w-4 text-maaef-red" />
          This is the locked original. Any edit here will ask you to name a new list and
          apply the change there — the original is never modified.
        </div>
      )}

      {editable && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 py-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Scope</label>
              <Select value={scope} onValueChange={(v) => setScope(v as EditScope)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {canEditSingle && <SelectItem value="single">Selected product</SelectItem>}
                  {canBulk && <SelectItem value="category">A category</SelectItem>}
                  {canBulk && <SelectItem value="list">Whole list</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {scope === "category" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Operation</label>
              <Select value={operation} onValueChange={(v) => setOperation(v as EditOperation)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="flat">Flat amount (₹)</SelectItem>
                  <SelectItem value="set">Set to value</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {operation === "percentage" ? "Percent (e.g. -5 or 10)" : operation === "flat" ? "Amount (e.g. -50)" : "New price"}
              </label>
              <Input
                type="number"
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-36"
                placeholder={operation === "percentage" ? "%" : "₹"}
              />
            </div>

            <Button onClick={runPreview} disabled={pending}>
              <Calculator className="h-4 w-4" /> {locked ? "Save as new list…" : "Preview"}
            </Button>

            {scope === "single" && (
              <span className="text-xs text-muted-foreground">
                {selectedIds.length === 1 ? "1 product selected" : "Tick one row to target it"}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Show category</label>
        <Select value={viewCategory} onValueChange={setViewCategory}>
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories ({rows.length})</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {viewCategory === "all"
            ? `${categories.length} categories`
            : `${visibleRows.length} product${visibleRows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <MyProductsGrid
        rows={visibleRows}
        showCost={showCost}
        editable={editable}
        onSelectionChanged={setSelectedIds}
        onPriceEdit={handleInlineEdit}
      />

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) { revertFn?.(); close(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {hasBreaches && showCost ? (
                <span className="flex items-center gap-2 text-maaef-red">
                  <AlertTriangle className="h-5 w-5" /> Below the cost floor
                </span>
              ) : (
                "Review changes"
              )}
            </DialogTitle>
            <DialogDescription>
              {preview?.affected ?? 0} product(s) in scope · {preview?.changed ?? 0} would change.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="muted">{preview?.changed ?? 0} changing</Badge>
              {blockedSilently && (
                <Badge variant="destructive">{preview?.breach_count} blocked (below floor)</Badge>
              )}
              {hasBreaches && showCost && (
                <Badge variant="destructive">{preview?.breach_count} below floor</Badge>
              )}
            </div>

            {/* Cost-bearing breach detail is only ever sent to view_cost users. */}
            {showCost && hasBreaches && preview?.breaches?.length ? (
              <div className="max-h-48 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">New price</th>
                      <th className="p-2 text-left">Floor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.breaches.map((b) => (
                      <tr key={b.product_id} className="border-t">
                        <td className="p-2 text-maaef-red">{formatPrice(b.new_price)}</td>
                        <td className="p-2">{formatPrice(b.floor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {blockedSilently && (
              <p className="rounded-md bg-muted p-3 text-muted-foreground">
                {preview?.breach_count} change(s) fall at or below the allowed floor and will be
                blocked. The rest will be applied.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { revertFn?.(); close(); }} disabled={pending}>
              Cancel
            </Button>
            {hasBreaches && showCost ? (
              <Button variant="destructive" onClick={() => commit(true)} disabled={pending}>
                Apply below floor anyway
              </Button>
            ) : (
              <Button onClick={() => commit(false)} disabled={pending}>
                {blockedSilently ? "Apply the rest" : "Apply"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Locked-list edit -> name a new version, which is created with the edit. */}
      <Dialog open={!!versionEdit} onOpenChange={(o) => { if (!o) setVersionEdit(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save changes as a new list</DialogTitle>
            <DialogDescription>
              &quot;{currentList.name}&quot; is locked and won&apos;t be changed. Name the new
              editable list — your edit is applied there.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="version-name">New list name</Label>
            <Input
              id="version-name"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && versionName.trim()) commitVersion();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersionEdit(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={commitVersion} disabled={pending || !versionName.trim()}>
              {pending ? "Creating…" : "Create & apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
