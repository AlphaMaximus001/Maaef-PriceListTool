"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  requireCapability,
  CAPABILITIES,
  type AppRole,
  type Capability,
} from "@/lib/capabilities";

export type ActionResult = { ok: boolean; message: string };

const ROLES: AppRole[] = ["admin", "editor", "viewer"];

/**
 * Create a user. Requires the service-role key (auth admin API). The DB
 * trigger creates the matching profile; we then set role + name.
 */
export async function createUser(formData: FormData): Promise<ActionResult> {
  await requireCapability("manage_users");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const role = String(formData.get("role") || "viewer") as AppRole;

  if (!email || !password) return { ok: false, message: "Email and password are required." };
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (!ROLES.includes(role)) return { ok: false, message: "Invalid role." };

  const admin = createServiceClient();
  if (!admin) {
    return {
      ok: false,
      message:
        "SUPABASE_SERVICE_ROLE_KEY is not configured — required to create users. Set it in the environment.",
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || email },
  });
  if (error || !data.user) {
    return { ok: false, message: error?.message ?? "Could not create user." };
  }

  // Ensure profile reflects the chosen role/name (trigger defaults to viewer).
  // Admin-created users are approved outright — they skip the sign-up queue.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role, full_name: fullName || email, approved: true })
    .eq("id", data.user.id);
  if (profileError) {
    return { ok: false, message: `User created, but role not set: ${profileError.message}` };
  }

  revalidatePath("/admin");
  return { ok: true, message: `Created ${email} as ${role}.` };
}

export async function setRole(formData: FormData): Promise<ActionResult> {
  const me = await requireCapability("manage_users");

  const userId = String(formData.get("user_id") || "");
  const role = String(formData.get("role") || "") as AppRole;
  if (!ROLES.includes(role)) return { ok: false, message: "Invalid role." };
  if (userId === me.profile.id && role !== "admin") {
    return { ok: false, message: "You can't demote your own admin account here." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  return { ok: true, message: `Role updated to ${role}.` };
}

/** Approve (or revoke approval for) an account — the sign-up access gate. */
export async function setApproved(formData: FormData): Promise<ActionResult> {
  const me = await requireCapability("manage_users");

  const userId = String(formData.get("user_id") || "");
  const approved = String(formData.get("approved") || "") === "true";
  if (userId === me.profile.id && !approved) {
    return { ok: false, message: "You can't revoke your own access." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ approved }).eq("id", userId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  return { ok: true, message: approved ? "Access granted." : "Access revoked." };
}

export type PdfCodeHit = { code: string; by: string; at: string; listName: string | null };

/** Search a catalogue PDF code back to who generated it and when. */
export async function lookupPdfCode(code: string): Promise<PdfCodeHit[]> {
  await requireCapability("manage_users");
  const c = code.trim();
  if (!c) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("pdf_exports")
    .select("code, generated_at, list_name, profiles(full_name, email)")
    .ilike("code", c)
    .order("generated_at", { ascending: false })
    .limit(50);
  return ((data as unknown as Array<{ code: string; generated_at: string; list_name: string | null; profiles: { full_name: string | null; email: string } | null }>) ?? []).map((r) => ({
    code: r.code,
    at: r.generated_at,
    listName: r.list_name,
    by: r.profiles?.full_name || r.profiles?.email || "—",
  }));
}

export async function setActive(formData: FormData): Promise<ActionResult> {
  const me = await requireCapability("manage_users");

  const userId = String(formData.get("user_id") || "");
  const active = String(formData.get("active") || "") === "true";
  if (userId === me.profile.id && !active) {
    return { ok: false, message: "You can't deactivate your own account." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ active }).eq("id", userId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  return { ok: true, message: active ? "User reactivated." : "User deactivated." };
}

/**
 * Per-person capability override (writes capability_grants).
 *  - "default": remove the override -> falls back to role default.
 *  - "grant"  : force-allow regardless of role.
 *  - "revoke" : force-deny regardless of role.
 */
export async function setCapabilityGrant(formData: FormData): Promise<ActionResult> {
  const me = await requireCapability("manage_users");

  const userId = String(formData.get("user_id") || "");
  const cap = String(formData.get("capability") || "") as Capability;
  const mode = String(formData.get("mode") || "default");

  if (!CAPABILITIES.includes(cap)) return { ok: false, message: "Unknown capability." };
  if (userId === me.profile.id && cap === "manage_users" && mode === "revoke") {
    return { ok: false, message: "You can't revoke your own manage-users access." };
  }

  const supabase = await createClient();

  if (mode === "default") {
    const { error } = await supabase
      .from("capability_grants")
      .delete()
      .eq("user_id", userId)
      .eq("capability_key", cap);
    if (error) return { ok: false, message: error.message };
  } else {
    const granted = mode === "grant";
    const { error } = await supabase.from("capability_grants").upsert(
      {
        user_id: userId,
        capability_key: cap,
        granted,
        granted_by: me.profile.id,
      },
      { onConflict: "user_id,capability_key" },
    );
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin");
  return { ok: true, message: "Capability updated." };
}
