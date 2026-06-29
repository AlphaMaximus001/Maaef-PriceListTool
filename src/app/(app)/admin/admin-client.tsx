"use client";

import * as React from "react";
import { toast } from "sonner";
import { UserPlus, ShieldCheck, Sliders } from "lucide-react";
import type { Capability, AppRole } from "@/lib/capabilities";
import {
  createUser,
  setRole,
  setActive,
  setCapabilityGrant,
  type ActionResult,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type CapabilityMeta = {
  key: Capability;
  label: string;
  description: string;
};

export type EffectiveCap = {
  value: boolean;
  source: "override" | "role";
  roleDefault: boolean;
};

export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: AppRole;
  active: boolean;
  effective: Record<Capability, EffectiveCap>;
};

const ROLES: AppRole[] = ["admin", "editor", "viewer"];

function notify(result: ActionResult) {
  if (result.ok) toast.success(result.message);
  else toast.error(result.message);
  return result;
}

export function AdminClient({
  users,
  capabilities,
  currentUserId,
}: {
  users: AdminUser[];
  capabilities: CapabilityMeta[];
  currentUserId: string;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-maaef-red" />
            Admin
          </h1>
          <p className="mt-1 text-muted-foreground">
            Users, roles, and per-person capability grants. This page is the single
            source of truth for access.
          </p>
        </div>
        <CreateUserDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Roles set the baseline. Open a user&apos;s capabilities to override the
            baseline for that person.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Capabilities</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium">{user.fullName || user.email}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell>
                    <Select
                      defaultValue={user.role}
                      disabled={pending}
                      onValueChange={(role) => {
                        const fd = new FormData();
                        fd.set("user_id", user.id);
                        fd.set("role", role);
                        startTransition(async () => {
                          notify(await setRole(fd));
                        });
                      }}
                    >
                      <SelectTrigger className="w-28 capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={user.active}
                        disabled={pending || user.id === currentUserId}
                        onCheckedChange={(active) => {
                          const fd = new FormData();
                          fd.set("user_id", user.id);
                          fd.set("active", String(active));
                          startTransition(async () => {
                            notify(await setActive(fd));
                          });
                        }}
                      />
                      {!user.active && <Badge variant="muted">Inactive</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <CapabilitiesDialog
                      user={user}
                      capabilities={capabilities}
                      disabled={pending}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CreateUserDialog() {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" />
          New user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) =>
            startTransition(async () => {
              const result = notify(await createUser(fd));
              if (result.ok) setOpen(false);
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>
              They sign in immediately with this password. They can change it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" name="full_name" placeholder="Asha Rao" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="asha@maaef.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Temporary password</Label>
              <Input id="password" name="password" type="text" required minLength={8} placeholder="min 8 characters" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select name="role" defaultValue="viewer">
                <SelectTrigger id="role" className="capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CapabilitiesDialog({
  user,
  capabilities,
  disabled,
}: {
  user: AdminUser;
  capabilities: CapabilityMeta[];
  disabled: boolean;
}) {
  const [pending, startTransition] = React.useTransition();

  const apply = (cap: Capability, mode: "default" | "grant" | "revoke") => {
    const fd = new FormData();
    fd.set("user_id", user.id);
    fd.set("capability", cap);
    fd.set("mode", mode);
    startTransition(async () => {
      notify(await setCapabilityGrant(fd));
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Sliders className="h-4 w-4" />
          Capabilities
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{user.fullName || user.email}</DialogTitle>
          <DialogDescription>
            <span className="capitalize">{user.role}</span> baseline. &quot;Default&quot;
            follows the role; &quot;Allow&quot;/&quot;Deny&quot; override it for this
            person only.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-1 overflow-auto py-2">
          {capabilities.map((cap) => {
            const eff = user.effective[cap.key];
            const current: "default" | "grant" | "revoke" =
              eff.source === "role" ? "default" : eff.value ? "grant" : "revoke";
            return (
              <div
                key={cap.key}
                className="flex items-center justify-between gap-4 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{cap.label}</span>
                    {eff.value ? (
                      <Badge variant="success">On</Badge>
                    ) : (
                      <Badge variant="muted">Off</Badge>
                    )}
                    {eff.source === "override" && (
                      <Badge variant="outline">override</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{cap.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground/70">
                    Role default: {eff.roleDefault ? "on" : "off"}
                  </p>
                </div>
                <TriState
                  value={current}
                  disabled={pending}
                  onChange={(mode) => apply(cap.key, mode)}
                />
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TriState({
  value,
  disabled,
  onChange,
}: {
  value: "default" | "grant" | "revoke";
  disabled: boolean;
  onChange: (mode: "default" | "grant" | "revoke") => void;
}) {
  const options: { key: "default" | "grant" | "revoke"; label: string }[] = [
    { key: "revoke", label: "Deny" },
    { key: "default", label: "Default" },
    { key: "grant", label: "Allow" },
  ];
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.key)}
          className={
            "px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 " +
            (value === opt.key
              ? opt.key === "grant"
                ? "bg-green-600 text-white"
                : opt.key === "revoke"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-secondary text-secondary-foreground"
              : "bg-background hover:bg-muted")
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
