import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { InfoTip } from "@/components/info-tip";
import { DocumentsClient, type DocRow } from "./documents-client";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const { can } = await requireSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("documents")
    .select("id, title, category, file_path, mime_type, size_bytes, uploaded_at, profiles(full_name, email)")
    .order("uploaded_at", { ascending: false });

  const rows: DocRow[] = ((data as unknown as Array<{
    id: string;
    title: string;
    category: string | null;
    file_path: string;
    mime_type: string | null;
    size_bytes: number | null;
    uploaded_at: string;
    profiles: { full_name: string | null; email: string } | null;
  }>) ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    filePath: d.file_path,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    uploadedAt: d.uploaded_at,
    uploadedBy: d.profiles?.full_name || d.profiles?.email || "—",
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Documents <InfoTip k="documents.page" side="right" />
        </h1>
        <p className="mt-1 text-muted-foreground">
          Operational documents — GST certificates, licenses, agreements. Everyone signed in can download;
          {can.manage_documents ? " you can upload and remove." : " uploading needs permission."}
        </p>
      </div>

      <DocumentsClient rows={rows} canManage={can.manage_documents} />
    </div>
  );
}
