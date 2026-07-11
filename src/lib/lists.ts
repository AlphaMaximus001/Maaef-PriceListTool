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

/** Supabase returns at most this many rows in one request. */
export const PAGE_SIZE = 1000;

/**
 * Load EVERY active product in a list. A single Supabase request is capped at
 * 1000 rows. Most lists fit in one request; when they don't, we fetch the exact
 * count once and pull the remaining pages in PARALLEL (not one-by-one), so a
 * large list costs ~2 round trips instead of one per 1000 rows. Ordered by id
 * for stable, non-overlapping pages (callers re-sort for display).
 */
export async function getAllListProducts<T = Record<string, unknown>>(
  listId: string,
  columns = "id, sku, product_name, display_name, category, price, currency",
): Promise<T[]> {
  const supabase = await createClient();
  const page = (from: number) =>
    supabase
      .from("my_products")
      .select(columns)
      .eq("list_id", listId)
      .eq("active", true)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

  const { data: first } = await page(0);
  const firstRows = (first as T[] | null) ?? [];
  if (firstRows.length < PAGE_SIZE) return firstRows;

  // More than one page — learn the total, then fetch the rest concurrently.
  const { count } = await supabase
    .from("my_products")
    .select("id", { count: "exact", head: true })
    .eq("list_id", listId)
    .eq("active", true);
  const total = count ?? firstRows.length;

  const rest: ReturnType<typeof page>[] = [];
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) rest.push(page(from));
  const pages = await Promise.all(rest);

  return firstRows.concat(...pages.map((p) => (p.data as T[] | null) ?? []));
}
