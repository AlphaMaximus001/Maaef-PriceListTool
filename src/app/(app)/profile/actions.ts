"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/capabilities";

export type ProfileResult = { ok: boolean; message: string };

/** Save the signed-in user's phone number. */
export async function savePhone(formData: FormData): Promise<ProfileResult> {
  const session = await requireSession();
  const phone = String(formData.get("phone") || "").trim();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ phone }).eq("id", session.profile.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/profile");
  return { ok: true, message: "Phone saved." };
}

/**
 * Upload the user's signature image into the private `signatures` bucket at
 * `<uid>/signature.<ext>` (RLS lets a user manage only their own folder).
 */
export async function uploadSignature(formData: FormData): Promise<ProfileResult> {
  const session = await requireSession();
  const file = formData.get("signature");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an image." };
  if (!file.type.startsWith("image/")) return { ok: false, message: "Signature must be an image (PNG/JPG)." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, message: "Image must be under 2 MB." };

  const supabase = await createClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${session.profile.id}/signature.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("signatures")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return { ok: false, message: `Upload failed: ${upErr.message}` };

  const { error } = await supabase.from("profiles").update({ signature_path: path }).eq("id", session.profile.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/profile");
  return { ok: true, message: "Signature uploaded." };
}

export async function removeSignature(): Promise<ProfileResult> {
  const session = await requireSession();
  const supabase = await createClient();
  if (session.profile.id) {
    await supabase.from("profiles").update({ signature_path: null }).eq("id", session.profile.id);
  }
  revalidatePath("/profile");
  return { ok: true, message: "Signature removed." };
}
