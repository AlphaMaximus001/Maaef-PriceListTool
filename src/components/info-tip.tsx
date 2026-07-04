"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { HELP, type HelpKey } from "@/lib/help";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The ⓘ button. Click (or tap) to open a detailed explanation of the feature
 * it sits next to. All copy lives in src/lib/help.ts — edit there.
 */
export function InfoTip({
  k,
  side = "top",
  className,
}: {
  k: HelpKey;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const entry = HELP[k];
  if (!entry) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is “${entry.title}”?`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-maaef-red focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} className="w-80" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1.5 text-sm font-semibold text-maaef-purple">{entry.title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{entry.body}</p>
      </PopoverContent>
    </Popover>
  );
}
