"use client";

import * as React from "react";
import { toast } from "sonner";
import { Search, FileSearch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/info-tip";
import { lookupPdfCode, type PdfCodeHit } from "./actions";

export function PdfCodeLookup() {
  const [code, setCode] = React.useState("");
  const [pending, start] = React.useTransition();
  const [hits, setHits] = React.useState<PdfCodeHit[] | null>(null);

  const search = () => {
    if (!code.trim()) return;
    start(async () => {
      try {
        setHits(await lookupPdfCode(code));
      } catch {
        toast.error("Lookup failed.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-maaef-red" /> Catalogue PDF code <InfoTip k="admin.pdfCode" />
        </CardTitle>
        <CardDescription>
          Every catalogue PDF has a code (e.g. <span className="font-mono">MAE123</span>) on each page. Search it
          to see who generated that PDF and when.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 font-mono uppercase"
              placeholder="MAE123"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <Button onClick={search} disabled={pending || !code.trim()}>
            {pending ? "Searching…" : "Search"}
          </Button>
        </div>

        {hits !== null && (
          hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No PDF found with that code.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {hits.map((h, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="muted" className="font-mono">{h.code}</Badge>
                    <span className="font-medium">{h.by}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {h.listName ? `${h.listName} · ` : ""}{new Date(h.at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
