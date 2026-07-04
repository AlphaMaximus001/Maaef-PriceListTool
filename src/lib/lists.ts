import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const LIST_COOKIE = "maaef_list_id";

export type PriceList = {
  id: string;
  name: string;
  is_original: boolean;
  locked: boolean;
  created_from: string | null;
  created_at: string;
};

/**
 * All price-list versions, originals first, then newest copies. Cached
 * per-request (React.cache) so the several callers on one page — getCurrentList,
 * the version bar, edit actions — share a single price_lists query.
 */
export const getLists = cache(async (): Promise<PriceList[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("price_lists")
    .select("id, name, is_original, locked, created_from, created_at")
    .eq("archived", false)
    .order("is_original", { ascending: false })
    .order("created_at", { ascending: true });
  return (data as PriceList[] | null) ?? [];
});

/**
 * The list the user is currently working in. Reads the selection cookie and
 * validates it; falls back to the newest original (or any list) so a stale
 * cookie never breaks a page.
 */
export const getCurrentList = cache(async (): Promise<PriceList | null> => {
  const lists = await getLists();
  if (lists.length === 0) return null;

  const cookieVal = (await cookies()).get(LIST_COOKIE)?.value;
  const found = lists.find((l) => l.id === cookieVal);
  if (found) return found;

  const originals = lists.filter((l) => l.is_original);
  if (originals.length) return originals[originals.length - 1]; // newest original
  return lists[lists.length - 1];
});

/** Current list id (or null if no lists exist yet). Convenience for queries. */
export async function getCurrentListId(): Promise<string | null> {
  return (await getCurrentList())?.id ?? null;
}
