"use client";

import * as React from "react";
import { toast } from "sonner";
import { UserPlus, ShieldCheck, Sliders } from "lucide-react";
import type { Capability, AppRole } from "@/lib/capabilities";
import {
  createUser,
  setRole,
  setActive,
  setApproved,
  setEmployeeName,
  setCapabilityGrant,
  deleteUser,
  type ActionResult,
} from "./actions";
import { Pencil, Trash2 } from "lucide-react";
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
import { InfoTip } from "@/components/info-tip";

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
  firstName: string | null;
  surname: string | null;
  employeeCode: string; // fixed part of the PDF ID, e.g. MAE499
  role: AppRole;
  active: boolean;
  approved: boolean;
  effective: Record<Capability, EffectiveCap>;
};

const ROLES: AppRole[] = ["superadmin", "admin", "editor", "viewer"];

function notify(result: ActionResult) {
  if (result.ok) toast.success(result.message);
  else toast.error(result.message);
  return result;
}

export function AdminClient({
  users,
  capabilities,
  currentUserId,
  currentUserRole,
  canDelete,
}: {
  users: AdminUser[];
  capabilities: CapabilityMeta[];
  currentUserId: string;
  currentUserRole: AppRole;
  canDelete: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const iAmSuper = currentUserRole === "superadmin";
  // Only a Superadmin can hand out the Superadmin role.
  const roleOptions = ROLES.filter((r) => r !== "superadmin" || iAmSuper);

  const approve = (userId: string, approved: boolean) => {
    const fd = new FormData();
    fd.set("user_id", userId);
    fd.set("approved", String(approved));
    startTransition(async () => {
      notify(await setApproved(fd));
    });
  };

  const pendingUsers = users.filter((u) => !u.approved);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {pendingUsers.length > 0 && (
        <div className="rounded-lg border border-maaef-red/40 bg-maaef-blush/40 p-4">
          <div className="font-medium text-maaef-purple">
            {pendingUsers.length} account{pendingUsers.length > 1 ? "s" : ""} awaiting access
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            These people signed up and can see nothing until you grant access below.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-maaef-red" />
            Admin
            <InfoTip k="admin.page" />
          </h1>
          <p className="mt-1 text-muted-foreground">
            Users, roles, and per-person capability grants. This page is the single
            source of truth for access.
          </p>
        </div>
        <CreateUserDialog roleOptions={roleOptions} />
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
                <TableHead>
                  <span className="inline-flex items-center gap-1">Access <InfoTip k="admin.approved" /></span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">Role <InfoTip k="admin.role" /></span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">Active <InfoTip k="admin.active" /></span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    Capabilities <InfoTip k="admin.capabilities" />
                    {canDelete && <InfoTip k="admin.superadmin" />}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className={!user.approved ? "bg-maaef-blush/30" : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{user.fullName || user.email}</span>
                      <EditNameDialog user={user} />
                    </div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <span>PDF ID</span>
                      <Badge variant="muted" className="font-mono">{user.employeeCode}</Badge>
                      {!user.surname && <span className="text-amber-600">· add surname</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.approved ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="success">Approved</Badge>
                        {user.id !== currentUserId && user.role !== "superadmin" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground"
                            disabled={pending}
                            onClick={() => approve(user.id, false)}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="muted">Pending</Badge>
                        <Button
                          size="sm"
                          className="h-7"
                          disabled={pending}
                          onClick={() => approve(user.id, true)}
                        >
                          Approve
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      defaultValue={user.role}
                      // A Superadmin's role is fixed — mutual protection.
                      disabled={pending || user.role === "superadmin"}
                      onValueChange={(role) => {
                        const fd = new FormData();
                        fd.set("user_id", user.id);
                        fd.set("role", role);
                        startTransition(async () => {
                          notify(await setRole(fd));
                        });
                      }}
                    >
                      <SelectTrigger className="w-32 capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions.map((r) => (
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
                        disabled={pending || user.id === currentUserId || user.role === "superadmin"}
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
                    <div className="flex items-center justify-end gap-1">
                      <CapabilitiesDialog
                        user={user}
                        capabilities={capabilities}
                        disabled={pending}
                      />
                      {/* Deleting is Superadmin-only, and never applies to a
                          Superadmin or to yourself. */}
                      {canDelete && user.id !== currentUserId && user.role !== "superadmin" && (
                        <DeleteUserDialog user={user} />
                      )}
                    </div>
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

/**
 * Permanent account deletion. Irreversible, so it asks for the email to be
 * typed out before the button arms — the same bar a bank app sets for closing
 * an account. Superadmin-only; the row never renders it for a Superadmin.
 */
function DeleteUserDialog({ user }: { user: AdminUser }) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const armed = typed.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          title="Delete this account"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {user.fullName || user.email}?</DialogTitle>
          <DialogDescription>
            This permanently removes the account and its sign-in. It cannot be undone.
            Their past work — price edits, flags, and log entries — is kept for the record.
            To keep the account but block access, use the Active switch instead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          <Label htmlFor={`del-${user.id}`}>
            Type <span className="font-mono font-semibold">{user.email}</span> to confirm
          </Label>
          <Input
            id={`del-${user.id}`}
            value={typed}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
            placeholder={user.email}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!armed || pending}
            onClick={() =>
              startTransition(async () => {
                const r = notify(await deleteUser(user.id));
                if (r.ok) setOpen(false);
              })
            }
          >
            <Trash2 className="h-4 w-4" />
            {pending ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserDialog({ roleOptions }: { roleOptions: AppRole[] }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span className="flex items-center gap-1.5">
        <DialogTrigger asChild>
          <Button>
            <UserPlus className="h-4 w-4" />
            New user
          </Button>
        </DialogTrigger>
        <InfoTip k="admin.newUser" side="bottom" />
      </span>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" name="first_name" placeholder="Asha" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surname">Surname</Label>
                <Input id="surname" name="surname" placeholder="Rao" />
              </div>
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
                  {roleOptions.map((r) => (
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

function EditNameDialog({ user }: { user: AdminUser }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="Edit name">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={(fd) => {
            fd.set("user_id", user.id);
            startTransition(async () => {
              const r = notify(await setEmployeeName(fd));
              if (r.ok) setOpen(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit name</DialogTitle>
            <DialogDescription>
              The first name (its initial and length) and surname initial drive this person&apos;s PDF ID.
              Their onboarding number never changes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <div className="space-y-2">
              <Label htmlFor={`fn-${user.id}`}>First name</Label>
              <Input id={`fn-${user.id}`} name="first_name" defaultValue={user.firstName ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`sn-${user.id}`}>Surname</Label>
              <Input id={`sn-${user.id}`} name="surname" defaultValue={user.surname ?? ""} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
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
