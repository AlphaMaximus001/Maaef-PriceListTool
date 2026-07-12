import { Clock } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

/**
 * Shown to a signed-in account that hasn't been approved yet. No app data is
 * rendered or fetched — the account holds no capabilities and RLS returns
 * nothing until an admin approves it from the Admin page.
 */
export function AwaitingAccess({ email }: { email: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-maaef-purple p-4">
      <div className="w-full max-w-md rounded-xl bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-maaef-blush text-maaef-red">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">Awaiting access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account (<span className="font-medium text-foreground">{email}</span>) was created and is
          waiting for an admin to approve it. You&apos;ll be able to sign in and use the tool as soon as
          access is granted — no data is visible until then.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Already approved? Sign out and back in to refresh your access.
        </p>
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
