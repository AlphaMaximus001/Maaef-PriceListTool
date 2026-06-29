import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * UI capability gate (brief §6: "A user who lacks a capability never sees a
 * dead button — hide or disable with a tooltip"). This is UX only; the real
 * enforcement is RLS + requireCapability() server-side.
 *
 *  - mode="hide"    : render nothing when not allowed (default).
 *  - mode="disable" : render children wrapped, visually disabled, with a tooltip.
 *
 * `allowed` is resolved upstream from getSession().can[...] — never a raw role.
 */
export function CapabilityGate({
  allowed,
  mode = "hide",
  reason = "You don't have permission for this action.",
  children,
}: {
  allowed: boolean;
  mode?: "hide" | "disable";
  reason?: string;
  children: React.ReactNode;
}) {
  if (allowed) return <>{children}</>;
  if (mode === "hide") return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex cursor-not-allowed opacity-50 [&_*]:pointer-events-none"
          aria-disabled
          tabIndex={0}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
