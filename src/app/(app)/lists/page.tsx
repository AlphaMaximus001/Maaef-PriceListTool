import Link from "next/link";
import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Store, ArrowRight } from "lucide-react";
import { UploadCompetitorDialog, UploadMyProductsDialog, UploadUnifiedDialog } from "./upload-dialogs";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const { can } = await requireSession();
  const supabase = await createClient();

  const [{ count: myCount }, { data: competitors }, { data: lists }] = await Promise.all([
    supabase.from("my_products").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("competitors").select("id, name").order("name"),
    supabase
      .from("competitor_lists")
      .select("id, name, competitor_id, row_count, uploaded_at")
      .order("uploaded_at", { ascending: false }),
  ]);

  const listsByCompetitor = new Map<string, typeof lists>();
  for (const l of lists ?? []) {
    const arr = listsByCompetitor.get(l.competitor_id) ?? [];
    arr.push(l);
    listsByCompetitor.set(l.competitor_id, arr as typeof lists);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lists</h1>
          <p className="mt-1 text-muted-foreground">
            Your list is the one you edit. Competitor lists are reference — read-only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can.bulk_edit && can.upload_competitor && <UploadUnifiedDialog />}
          {can.bulk_edit && <UploadMyProductsDialog />}
          {can.upload_competitor && (
            <UploadCompetitorDialog competitors={competitors ?? []} />
          )}
        </div>
      </div>

      {/* Your list — the protagonist. */}
      <Card className="border-maaef-red/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-maaef-red/10 text-maaef-red">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Maaef products <Badge>Your list</Badge>
                </CardTitle>
                <CardDescription>{myCount ?? 0} products · editable</CardDescription>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href="/lists/my">
                Open <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Competitor lists. */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Competitor lists</h2>
        {(!competitors || competitors.length === 0) && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No competitor lists yet.
              {can.upload_competitor ? " Upload one to start comparing." : ""}
            </CardContent>
          </Card>
        )}
        <div className="space-y-4">
          {(competitors ?? []).map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  {c.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(listsByCompetitor.get(c.id) ?? []).map((l) => (
                  <Link
                    key={l.id}
                    href={`/lists/competitor/${l.id}`}
                    className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted"
                  >
                    <div>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.row_count} items · {new Date(l.uploaded_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="muted">Read-only</Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
                {(listsByCompetitor.get(c.id) ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No lists for this competitor yet.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
