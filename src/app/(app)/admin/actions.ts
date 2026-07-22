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
  const firstName = String(formData.get("first_name") || "").trim();
  const surname = String(formData.get("surname") || "").trim();
  const role = String(formData.get("role") || "viewer") as AppRole;

  if (!firstName) return { ok: false, message: "First name is required." };
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

  const fullName = [firstName, surname].filter(Boolean).join(" ");
  // first_name/surname/onboard_no are set by the DB trigger from this metadata.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, first_name: firstName, surname },
  });
  if (error || !data.user) {
    return { ok: false, message: error?.message ?? "Could not create user." };
  }

  // Set role + approve (name fields already set by the trigger; admin-created
  // users skip the sign-up approval queue).
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role, full_name: fullName, approved: true })
    .eq("id", data.user.id);
  if (profileError) {
    return { ok: false, message: `User created, but role not set: ${profileError.message}` };
  }

  revalidatePath("/admin");
  return { ok: true, message: `Created ${email} as ${role}.` };
}

/** Admin sets/fixes an employee's first name + surname (drives their PDF ID). */
export async function setEmployeeName(formData: FormData): Promise<ActionResult> {
  await requireCapability("manage_users");
  const userId = String(formData.get("user_id") || "");
  const firstName = String(formData.get("first_name") || "").trim();
  const surname = String(formData.get("surname") || "").trim();
  if (!firstName) return { ok: false, message: "First name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ first_name: firstName, surname: surname || null, full_name: [firstName, surname].filter(Boolean).join(" ") })
    .eq("id", userId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  return { ok: true, message: "Name updated." };
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

// ── Department directory: teams, membership, and contact details ─────────────

export type TeamMemberRole = "lead" | "hr" | "member";
const MEMBER_ROLES: TeamMemberRole[] = ["lead", "hr", "member"];

export async function createTeam(formData: FormData): Promise<ActionResult> {
  await requireCapability("manage_users");
  const name = String(formData.get("name") || "").trim();
  if (!name) return { ok: false, message: "Team name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("teams").insert({ name });
  if (error) {
    return { ok: false, message: /duplicate|unique/i.test(error.message) ? "A team with that name already exists." : error.message };
  }
  revalidatePath("/admin");
  return { ok: true, message: `Team “${name}” created.` };
}

export async function renameTeam(formData: FormData): Promise<ActionResult> {
  await requireCapability("manage_users");
  const teamId = String(formData.get("team_id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) return { ok: false, message: "Team name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("teams").update({ name }).eq("id", teamId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Team renamed." };
}

export async function deleteTeam(teamId: string): Promise<ActionResult> {
  await requireCapability("manage_users");
  const supabase = await createClient();
  const { error } = await supabase.from("teams").delete().eq("id", teamId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Team removed." };
}

export async function addTeamMember(formData: FormData): Promise<ActionResult> {
  await requireCapability("manage_users");
  const teamId = String(formData.get("team_id") || "");
  const profileId = String(formData.get("profile_id") || "");
  const memberRole = String(formData.get("member_role") || "member") as TeamMemberRole;
  if (!teamId || !profileId) return { ok: false, message: "Pick a person to add." };
  if (!MEMBER_ROLES.includes(memberRole)) return { ok: false, message: "Invalid role." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .upsert({ team_id: teamId, profile_id: profileId, member_role: memberRole }, { onConflict: "team_id,profile_id" });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Member added." };
}

export async function setMemberRole(memberId: string, memberRole: TeamMemberRole): Promise<ActionResult> {
  await requireCapability("manage_users");
  if (!MEMBER_ROLES.includes(memberRole)) return { ok: false, message: "Invalid role." };
  const supabase = await createClient();
  const { error } = await supabase.from("team_members").update({ member_role: memberRole }).eq("id", memberId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Role updated." };
}

export async function removeTeamMember(memberId: string): Promise<ActionResult> {
  await requireCapability("manage_users");
  const supabase = await createClient();
  const { error } = await supabase.from("team_members").delete().eq("id", memberId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Member removed." };
}

/** Admin sets an employee's contact details (phone + designation) for the directory. */
export async function setContactDetails(formData: FormData): Promise<ActionResult> {
  await requireCapability("manage_users");
  const userId = String(formData.get("user_id") || "");
  const phone = String(formData.get("phone") || "").trim();
  const title = String(formData.get("title") || "").trim();
  if (!userId) return { ok: false, message: "Missing user." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ phone: phone || null, title: title || null })
    .eq("id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "Contact details updated." };
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
