"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { X, Save, Flag, Check, History, Plus, Trash2 } from "lucide-react";
import type { MyProductRow } from "./my-grid";
import {
  getProductDetail,
  saveProductDetails,
  addFlag,
  resolveFlag,
  type ProductDetail,
  type MarginType,
} from "./detail-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/info-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

type SpecKV = { key: string; value: string };

export function SkuDetailPanel({
  row,
  showCost,
  showMargin,
  canEditSpecs,
  locked,
  currentListName,
  onClose,
}: {
  row: MyProductRow;
  showCost: boolean;
  showMargin: boolean;
  canEditSpecs: boolean;
  locked: boolean;
  currentListName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<ProductDetail | null>(null);
  const [pending, start] = React.useTransition();

  // Editable local state.
  const [name, setName] = React.useState(row.product_name);
  const [category, setCategory] = React.useState(row.category);
  const [cost, setCost] = React.useState<string>(row.cost != null ? String(row.cost) : "");
  const [marginType, setMarginType] = React.useState<MarginType>(null);
  const [marginValue, setMarginValue] = React.useState<string>("");
  const [specs, setSpecs] = React.useState<SpecKV[]>([]);

  const [flagReason, setFlagReason] = React.useState("");
  const [versionName, setVersionName] = React.useState("");
  const [askName, setAskName] = React.useState(false);

  const load = React.useCallback(() => {
    start(async () => {
      const d = await getProductDetail(row.id);
      setDetail(d);
      setMarginType(d.marginType);
      setMarginValue(d.marginValue != null ? String(d.marginValue) : "");
    });
  }, [row.id]);

  React.useEffect(() => {
    setName(row.product_name);
    setCategory(row.category);
    setCost(row.cost != null ? String(row.cost) : "");
    setSpecs([]);
    load();
  }, [row.id, row.product_name, row.category, row.cost, load]);

  const buildPatch = () => ({
    productId: row.id,
    product_name: name !== row.product_name ? name : undefined,
    category: category !== row.category ? category : undefined,
    specs: specs.length ? Object.fromEntries(specs.filter((s) => s.key.trim()).map((s) => [s.key.trim(), s.value])) : undefined,
    cost: showCost && cost !== (row.cost != null ? String(row.cost) : "") ? (cost === "" ? null : Number(cost)) : undefined,
    marginType: marginType,
    marginValue: marginValue === "" ? null : Number(marginValue),
  });

  const doSave = (name2?: string) => {
    start(async () => {
      const r = await saveProductDetails(buildPatch(), name2);
      if (r.needName) {
        setAskName(true);
        return;
      }
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.ok) {
        setAskName(false);
        router.refresh();
      }
    });
  };

  return (
    <Card className="border-maaef-red/30">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            {row.sku} <InfoTip k="mylist.detail" />
          </CardTitle>
          <p className="text-sm text-muted-foreground">Details, edits & flags</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {/* ── Editable details ── */}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Product name</Label>
            <Input value={name} disabled={!canEditSpecs} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Input value={category} disabled={!canEditSpecs} onChange={(e) => setCategory(e.target.value)} />
          </div>

          {canEditSpecs && (
            <div className="space-y-1">
              <Label className="flex items-center justify-between">
                Spec attributes
                <Button type="button" size="sm" variant="ghost" onClick={() => setSpecs((s) => [...s, { key: "", value: "" }])}>
                  <Plus className="h-3 w-3" /> add
                </Button>
              </Label>
              {specs.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="key (e.g. pages)" value={s.key} onChange={(e) => setSpecs((arr) => arr.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                  <Input placeholder="value" value={s.value} onChange={(e) => setSpecs((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => setSpecs((arr) => arr.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Blank leaves existing specs unchanged; set keys to overwrite them.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Price</Label>
              <div className="font-medium">{formatPrice(row.price, row.currency)}</div>
            </div>
            {showMargin && (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground">MUSP</Label>
                  <div className="font-medium">{row.musp != null ? formatPrice(row.musp, row.currency) : "—"}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">MP</Label>
                  <div className="font-medium text-maaef-purple">{row.mp != null ? formatPrice(row.mp, row.currency) : "—"}</div>
                </div>
              </>
            )}
          </div>

          {showCost && canEditSpecs && (
            <div className="grid grid-cols-3 gap-2 rounded-md border p-3">
              <div className="col-span-3 text-xs font-medium text-maaef-red">Cost floor & margin (private)</div>
              <div className="space-y-1">
                <Label className="text-xs">Cost</Label>
                <Input type="number" step="any" value={cost} onChange={(e) => setCost(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Margin</Label>
                <Select value={marginType ?? "default"} onValueChange={(v) => setMarginType(v === "default" ? null : (v as MarginType))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Global default</SelectItem>
                    <SelectItem value="percent">Percent %</SelectItem>
                    <SelectItem value="flat">Flat ₹</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Value</Label>
                <Input type="number" step="any" value={marginValue} disabled={marginType === null} onChange={(e) => setMarginValue(e.target.value)} />
              </div>
            </div>
          )}

          {canEditSpecs && (
            <Button onClick={() => doSave()} disabled={pending}>
              <Save className="h-4 w-4" /> {locked ? "Save as new list…" : "Save details"}
            </Button>
          )}
        </div>

        {/* ── Flags + audit ── */}
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Flag className="h-4 w-4 text-maaef-red" /> Flags
            </div>
            <div className="flex gap-2">
              <Input value={flagReason} onChange={(e) => setFlagReason(e.target.value)} placeholder="Why are you flagging this?" />
              <Button
                variant="outline"
                disabled={pending || !flagReason.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await addFlag(row.id, flagReason);
                    r.ok ? toast.success(r.message) : toast.error(r.message);
                    if (r.ok) { setFlagReason(""); load(); router.refresh(); }
                  })
                }
              >
                Flag
              </Button>
            </div>
            <ul className="mt-2 space-y-2">
              {detail?.flags.map((f) => (
                <li key={f.id} className={"rounded-md border p-2 text-sm " + (f.resolved ? "opacity-50" : "")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div>{f.reason}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.createdByEmail} · {new Date(f.createdAt).toLocaleString()}
                        {f.resolved && " · resolved"}
                      </div>
                    </div>
                    {!f.resolved && f.canResolve && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await resolveFlag(f.id);
                            r.ok ? toast.success(r.message) : toast.error(r.message);
                            if (r.ok) { load(); router.refresh(); }
                          })
                        }
                      >
                        <Check className="h-4 w-4" /> Resolve
                      </Button>
                    )}
                  </div>
                </li>
              ))}
              {detail && detail.flags.length === 0 && <li className="text-sm text-muted-foreground">No flags.</li>}
            </ul>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" /> Change history
            </div>
            <div className="max-h-56 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted text-muted-foreground">
                  <tr><th className="p-2 text-left">Field</th><th className="p-2 text-left">Change</th><th className="p-2 text-left">By / when</th></tr>
                </thead>
                <tbody>
                  {detail?.audit.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-2"><Badge variant="muted" className="capitalize">{a.kind.replace("_", " ")}</Badge></td>
                      <td className="p-2"><span className="text-muted-foreground line-through">{a.old}</span> → <span className="font-medium">{a.new}</span></td>
                      <td className="p-2 text-muted-foreground">{a.actor}<br />{new Date(a.at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {detail && detail.audit.length === 0 && (
                    <tr><td colSpan={3} className="p-3 text-center text-muted-foreground">No changes yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Locked-list: name a new version to hold the edit */}
      <Dialog open={askName} onOpenChange={setAskName}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save changes as a new list</DialogTitle>
            <DialogDescription>
              &quot;{currentListName}&quot; is locked. Name the new editable list — your spec/detail
              change is applied there, and the original stays untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>New list name</Label>
            <Input value={versionName} onChange={(e) => setVersionName(e.target.value)} autoFocus placeholder={`${currentListName} — copy`} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAskName(false)} disabled={pending}>Cancel</Button>
            <Button onClick={() => doSave(versionName)} disabled={pending || !versionName.trim()}>Create & save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
