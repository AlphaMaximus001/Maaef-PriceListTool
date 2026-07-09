"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// Tables whose changes should prompt other open tabs/users to refresh.
const WATCHED = [
  "my_products",
  "price_lists",
  "price_edits",
  "flags",
  "product_change_log",
  "product_matches",
  "product_costs",
  "app_settings",
];

/**
 * Subscribes to Supabase Realtime. When data changes (from any user or tab),
 * shows a "Data updated — refresh" banner instead of auto-refreshing, so no
 * in-progress edit is ever lost. Clicking Refresh re-fetches the current page.
 *
 * Note: a change made in THIS tab may also surface the banner; refreshing then
 * is harmless (the page is already current). This is intentional over
 * auto-refresh, which could discard unsaved input.
 */
export function RealtimeWatcher() {
  const router = useRouter();
  const [stale, setStale] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("maaef-app-changes");
    for (const table of WATCHED) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => setStale(true));
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border bg-maaef-purple px-4 py-2 text-sm text-white shadow-lg">
        <span>Data was updated elsewhere.</span>
        <Button
          size="sm"
          className="h-7 bg-white text-maaef-purple hover:bg-white/90"
          onClick={() => {
            setStale(false);
            router.refresh();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setStale(false)}
          className="text-white/70 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
