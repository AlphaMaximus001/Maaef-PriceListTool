"use client";

import Link from "next/link";
import { LogOut, UserCog } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function UserMenu({
  email,
  role,
}: {
  email: string;
  role: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium leading-none">{email}</p>
        <Badge variant="muted" className="mt-1 capitalize">
          {role}
        </Badge>
      </div>
      <Button asChild variant="ghost" size="icon" title="My profile">
        <Link href="/profile">
          <UserCog className="h-4 w-4" />
        </Link>
      </Button>
      <form action={signOut}>
        <Button variant="ghost" size="icon" type="submit" title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
