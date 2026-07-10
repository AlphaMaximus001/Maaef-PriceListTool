"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Download, Trash2, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/info-tip";
import { uploadDocument, getDownloadUrl, deleteDocument } from "./actions";

export type DocRow = {
  id: string;
  title: string;
  category: string | null;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
  uploadedBy: string;
};

function fmtSize(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsClient({ rows, canManage }: { rows: DocRow[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const doUpload = (formData: FormData) => {
    start(async () => {
      const r = await uploadDocument(formData);
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  };

  const doDownload = (row: DocRow) => {
    setDownloading(row.id);
    (async () => {
      const { url, message } = await getDownloadUrl(row.filePath);
      setDownloading(null);
      if (!url) {
        toast.error(message ?? "Could not open the file.");
        return;
      }
      window.open(url, "_blank");
    })();
  };

  const doDelete = (row: DocRow) => {
    if (!confirm(`Remove “${row.title}”? This deletes the file.`)) return;
    start(async () => {
      const r = await deleteDocument(row.id, row.filePath);
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4 text-maaef-red" /> Upload a document <InfoTip k="documents.upload" />
            </CardTitle>
            <CardDescription>PDFs, images, spreadsheets — up to 25 MB.</CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} action={doUpload} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="d-title">Title</Label>
                <Input id="d-title" name="title" placeholder="GST Certificate 2025–26" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-cat">Category</Label>
                <Input id="d-cat" name="category" list="doc-cats" placeholder="GST / License / Agreement" />
                <datalist id="doc-cats">
                  <option value="GST" />
                  <option value="License" />
                  <option value="Certificate" />
                  <option value="Agreement" />
                </datalist>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="d-file">File</Label>
                <Input id="d-file" name="file" type="file" required />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={pending}>
                  <Upload className="h-4 w-4" /> {pending ? "Uploading…" : "Upload"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No documents yet.
            </CardContent>
          </Card>
        ) : (
          rows.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-maaef-red/10 text-maaef-red">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{d.title}</span>
                      {d.category && <Badge variant="muted">{d.category}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fmtSize(d.sizeBytes)} · {d.uploadedBy} · {new Date(d.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={downloading === d.id} onClick={() => doDownload(d)}>
                    <Download className="h-4 w-4" /> {downloading === d.id ? "Opening…" : "Download"}
                  </Button>
                  {canManage && (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => doDelete(d)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
