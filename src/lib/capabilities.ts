import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

/** The full set of gated actions. Mirrors the `capabilities` table keys. */
export const CAPABILITIES = [
  "view_cost",
  "edit_price",
  "bulk_edit",
  "upload_competitor",
  "confirm_match",
  "export_pdf",
  "manage_users",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type AppRole = "admin" | "editor" | "viewer";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  active: boolean;
};

/**
 * Resolved session: the signed-in profile plus a flat capability map.
 * Every UI gate and server check reads from here — never from raw role checks
 * (invariant 5). The map is computed once per request and cached.
 */
export type Session = {
  profile: Profile;
  can: Record<Capability, boolean>;
};

/**
 * Loads the current user's profile and resolves every capability through the
 * database `has_capability()` resolver (per-person override beats role default).
 * Cached per-request via React.cache so repeated gate checks hit the DB once.
 *
 * Returns null when there is no authenticated, active user.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) return null;

  // Resolve every capability in TWO parallel queries (role defaults + the user's
  // overrides) and combine in JS — same rule as the DB has_capability()
  // resolver (per-person override beats role default, else deny), but without a
  // network round-trip per capability. This runs on every navigation, so the
  // round-trip count matters.
  const [{ data: defaults }, { data: grants }] = await Promise.all([
    supabase.from("role_defaults").select("capability_key, granted").eq("role", profile.role),
    supabase.from("capability_grants").select("capability_key, granted").eq("user_id", user.id),
  ]);

  const defaultMap = new Map((defaults ?? []).map((d) => [d.capability_key, d.granted]));
  const overrideMap = new Map((grants ?? []).map((g) => [g.capability_key, g.granted]));

  const can = Object.fromEntries(
    CAPABILITIES.map((cap) => {
      const override = overrideMap.get(cap);
      const value = override !== undefined ? override : defaultMap.get(cap) ?? false;
      return [cap, value === true];
    }),
  ) as Record<Capability, boolean>;

  return { profile: profile as Profile, can };
});

/** Throws if there is no session at all (route should already be guarded). */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

/**
 * Server-side capability enforcement for Server Actions (invariant 5 / §6:
 * "Server actions re-check capability server-side"). Throws on failure.
 */
export async function requireCapability(cap: Capability): Promise<Session> {
  const session = await requireSession();
  if (!session.can[cap]) {
    throw new Error(`Missing capability: ${cap}`);
  }
  return session;
}
