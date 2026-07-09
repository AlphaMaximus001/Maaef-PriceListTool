import { redirect } from "next/navigation";
import { getSession, CAPABILITIES, type Capability, type AppRole } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { AdminClient, type AdminUser, type CapabilityMeta } from "./admin-client";
import { MarginSettings } from "./margin-settings";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Server-side gate on the resolver (invariant 5). Never trust the nav alone.
  if (!session.can.manage_users) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-lg font-semibold">No access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have the <code>manage_users</code> capability.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: profiles }, { data: caps }, { data: roleDefaults }, { data: grants }, { data: marginSetting }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, role, active, created_at")
        .order("created_at", { ascending: true }),
      supabase.from("capabilities").select("key, label, description").order("key"),
      supabase.from("role_defaults").select("role, capability_key, granted"),
      supabase.from("capability_grants").select("user_id, capability_key, granted"),
      supabase.from("app_settings").select("value").eq("key", "default_margin").maybeSingle(),
    ]);

  const dm = (marginSetting?.value as { type?: "percent" | "flat"; value?: number } | null) ?? {};

  // Build the role-default lookup: role -> cap -> bool.
  const defaultsByRole: Record<string, Record<string, boolean>> = {};
  for (const rd of roleDefaults ?? []) {
    (defaultsByRole[rd.role] ??= {})[rd.capability_key] = rd.granted;
  }

  // Build the per-user override lookup: userId -> cap -> bool.
  const overridesByUser: Record<string, Record<string, boolean>> = {};
  for (const g of grants ?? []) {
    (overridesByUser[g.user_id] ??= {})[g.capability_key] = g.granted;
  }

  const capList: CapabilityMeta[] = (caps ?? []).map((c) => ({
    key: c.key as Capability,
    label: c.label,
    description: c.description,
  }));

  const users: AdminUser[] = (profiles ?? []).map((p) => {
    const role = p.role as AppRole;
    const overrides = overridesByUser[p.id] ?? {};
    const effective = Object.fromEntries(
      CAPABILITIES.map((cap) => {
        const override = overrides[cap];
        const roleDefault = defaultsByRole[role]?.[cap] ?? false;
        const value = override ?? roleDefault;
        const source: "override" | "role" = override === undefined ? "role" : "override";
        return [cap, { value, source, roleDefault }];
      }),
    ) as AdminUser["effective"];

    return {
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      role,
      active: p.active,
      effective,
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <AdminClient users={users} capabilities={capList} currentUserId={session.profile.id} />
      {session.can.edit_specs && (
        <MarginSettings type={dm.type ?? "percent"} value={dm.value ?? 0} />
      )}
    </div>
  );
}
