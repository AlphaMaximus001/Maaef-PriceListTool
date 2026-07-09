"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { setDefaultMargin } from "../lists/my/detail-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoTip } from "@/components/info-tip";

export function MarginSettings({ type, value }: { type: "percent" | "flat"; value: number }) {
  const router = useRouter();
  const [t, setT] = React.useState<"percent" | "flat">(type);
  const [v, setV] = React.useState(String(value));
  const [pending, start] = React.useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Default margin <InfoTip k="admin.defaultMargin" />
        </CardTitle>
        <CardDescription>
          Used to compute MP (cost + margin) for products with no per-product override.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={t} onValueChange={(x) => setT(x as "percent" | "flat")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percent of cost (%)</SelectItem>
              <SelectItem value="flat">Flat amount (₹)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Value</Label>
          <Input type="number" step="any" value={v} onChange={(e) => setV(e.target.value)} className="w-32" />
        </div>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setDefaultMargin(t, Number(v));
              r.ok ? toast.success(r.message) : toast.error(r.message);
              if (r.ok) router.refresh();
            })
          }
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
