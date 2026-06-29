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

  // Resolve all capabilities in one round trip through has_capability().
  const can = Object.fromEntries(
    CAPABILITIES.map((c) => [c, false]),
  ) as Record<Capability, boolean>;

  const results = await Promise.all(
    CAPABILITIES.map(async (cap) => {
      const { data } = await supabase.rpc("has_capability", {
        uid: user.id,
        cap,
      });
      return [cap, data === true] as const;
    }),
  );
  for (const [cap, granted] of results) can[cap] = granted;

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
