"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, signUp, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

function SubmitButton({ mode }: { mode: Mode }) {
  const { pending } = useFormStatus();
  const label = mode === "signin" ? "Sign in" : "Create account";
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (mode === "signin" ? "Signing in…" : "Creating…") : label}
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = React.useState<Mode>("signin");

  const [signInState, signInAction] = useActionState<LoginState, FormData>(signIn, {
    error: null,
  });
  const [signUpState, signUpAction] = useActionState<LoginState, FormData>(signUp, {
    error: null,
  });

  const state = mode === "signin" ? signInState : signUpState;

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Sign in / Sign up switch */}
        <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm font-medium">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md py-1.5 transition-colors",
                mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {m === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        {mode === "signin" ? (
          <form action={signInAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@maaef.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {signInState.error && (
              <p className="text-sm font-medium text-destructive">{signInState.error}</p>
            )}
            <SubmitButton mode="signin" />
          </form>
        ) : (
          <form action={signUpAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="su-name">Full name</Label>
              <Input id="su-name" name="full_name" type="text" autoComplete="name" placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-email">Email</Label>
              <Input id="su-email" name="email" type="email" autoComplete="email" placeholder="you@maaef.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-password">Password</Label>
              <Input id="su-password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" required />
            </div>
            {signUpState.error && (
              <p className="text-sm font-medium text-destructive">{signUpState.error}</p>
            )}
            {signUpState.notice && (
              <p className="rounded-md bg-maaef-blush/60 p-2 text-sm font-medium text-maaef-purple">
                {signUpState.notice}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              New accounts start with read-only access. An admin can grant more later.
            </p>
            <SubmitButton mode="signup" />
          </form>
        )}
      </CardContent>
    </Card>
  );
}
