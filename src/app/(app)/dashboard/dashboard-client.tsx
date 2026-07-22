"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pin, PinOff, Search, Save, Download, FileText, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  setPinnedList,
  setPinnedProduct,
  saveNotes,
  searchProducts,
  type ProductHit,
} from "./actions";
import { getDownloadUrl } from "../documents/actions";

const money = (n: number, ccy: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: ccy || "INR", maximumFractionDigits: 0 }).format(n);

// ── Pinned list ──────────────────────────────────────────────────────────────
export function PinnedListCard({
  lists,
  pinned,
}: {
  lists: { id: string; name: string; is_original: boolean }[];
  pinned: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const choose = (id: string) => {
    start(async () => {
      const r = await setPinnedList(id || null);
      r.ok ? toast.success(id ? "List pinned." : "List unpinned.") : toast.error(r.message);
      if (r.ok) router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Pin className="h-4 w-4 text-maaef-red" /> Pinned list
        </CardTitle>
        <CardDescription>Jump straight to a list you use often.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pinned ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
            <span className="truncate font-medium">{pinned.name}</span>
            <Button asChild size="sm" variant="outline">
              <Link href="/lists/my">Open <ExternalLink className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No list pinned yet.</p>
        )}
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={pinned?.id ?? ""}
          disabled={pending}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="">— Choose a list to pin —</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}{l.is_original ? " (Original)" : ""}
            </option>
          ))}
        </select>
      </CardContent>
    </Card>
  );
}

// ── Pinned SKU ────────────────────────────────────────────────────────────────
export function PinnedSkuCard({
  pinned,
}: {
  pinned: { id: string; sku: string; name: string; price: number; currency: string; listName: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<ProductHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      setHits(await searchProducts(q));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const pin = (id: string | null) => {
    start(async () => {
      const r = await setPinnedProduct(id);
      r.ok ? toast.success(id ? "SKU pinned." : "SKU unpinned.") : toast.error(r.message);
      if (r.ok) { setOpen(false); setQ(""); setHits([]); router.refresh(); }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Pin className="h-4 w-4 text-maaef-red" /> Pinned SKU
        </CardTitle>
        <CardDescription>Keep one product a click away.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pinned ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{pinned.name}</div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">{pinned.sku}</div>
              </div>
              <span className="whitespace-nowrap font-semibold">{money(pinned.price, pinned.currency)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{pinned.listName}</span>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => pin(null)}>
                <PinOff className="h-3.5 w-3.5" /> Unpin
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No SKU pinned yet.</p>
        )}

        {open ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-8"
                placeholder="Search SKU or product name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
            {hits.length > 0 && (
              <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => pin(h.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{h.name}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{h.sku} · {h.listName}</span>
                      </span>
                      <span className="whitespace-nowrap text-xs">{money(h.price, h.currency)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.trim().length >= 2 && !searching && hits.length === 0 && (
              <p className="text-xs text-muted-foreground">No matches.</p>
            )}
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setQ(""); }}>Cancel</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Search className="h-4 w-4" /> {pinned ? "Change SKU" : "Pick a SKU"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────────
export function NotesCard({ initial }: { initial: string }) {
  const [text, setText] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const dirty = text !== initial;

  const save = () => {
    start(async () => {
      const r = await saveNotes(text);
      r.ok ? toast.success("Notes saved.") : toast.error(r.message);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes</CardTitle>
        <CardDescription>A private scratchpad, just for you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          className="min-h-[140px] w-full resize-y rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Reminders, to-dos, anything you want to remember…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => { if (dirty) save(); }}
          maxLength={10000}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={pending || !dirty} onClick={save}>
            <Save className="h-4 w-4" /> {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Quick document downloads ──────────────────────────────────────────────────
export function QuickDocsCard({
  docs,
}: {
  docs: { id: string; title: string; category: string | null; filePath: string }[];
}) {
  const [downloading, setDownloading] = React.useState<string | null>(null);

  const download = (id: string, filePath: string) => {
    setDownloading(id);
    (async () => {
      const { url, message } = await getDownloadUrl(filePath);
      setDownloading(null);
      if (!url) { toast.error(message ?? "Could not open the file."); return; }
      window.open(url, "_blank");
    })();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-maaef-red" /> Quick documents
        </CardTitle>
        <CardDescription>Download shared paperwork in one click.</CardDescription>
      </CardHeader>
      <CardContent>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{d.title}</span>
                  {d.category && <Badge variant="muted">{d.category}</Badge>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={downloading === d.id}
                  onClick={() => download(d.id, d.filePath)}
                >
                  <Download className="h-4 w-4" /> {downloading === d.id ? "…" : "Get"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
