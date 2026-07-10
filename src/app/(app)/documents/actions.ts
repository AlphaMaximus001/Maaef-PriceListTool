"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requireCapability } from "@/lib/capabilities";

const BUCKET = "documents";

export type DocResult = { ok: boolean; message: string };

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "file";
}

/** Upload an operational document (GST cert, license, etc.) and catalogue it. */
export async function uploadDocument(formData: FormData): Promise<DocResult> {
  const session = await requireCapability("manage_documents");
  const file = formData.get("file");
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();

  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file." };
  if (!title) return { ok: false, message: "Give the document a title." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, message: "File too large (max 25 MB)." };

  const supabase = await createClient();
  const path = `${Date.now()}-${safeName(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { ok: false, message: upErr.message };

  const { error: insErr } = await supabase.from("documents").insert({
    title,
    category: category || null,
    file_path: path,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: session.profile.id,
  });
  if (insErr) {
    // Roll back the orphaned object so the bucket and table stay consistent.
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, message: insErr.message };
  }

  revalidatePath("/documents");
  return { ok: true, message: "Document uploaded." };
}

/** A short-lived signed URL so any signed-in teammate can download. */
export async function getDownloadUrl(filePath: string): Promise<{ url: string | null; message?: string }> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60, { download: true });
  if (error || !data) return { url: null, message: error?.message ?? "Could not create link." };
  return { url: data.signedUrl };
}

export async function deleteDocument(id: string, filePath: string): Promise<DocResult> {
  await requireCapability("manage_documents");
  const supabase = await createClient();
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  await supabase.storage.from(BUCKET).remove([filePath]);
  revalidatePath("/documents");
  return { ok: true, message: "Document removed." };
}
