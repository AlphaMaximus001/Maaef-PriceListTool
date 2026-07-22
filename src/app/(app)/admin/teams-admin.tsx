"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, Plus, Trash2, Crown, HeartHandshake, Mail, Phone, Pencil, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/info-tip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  createTeam, renameTeam, deleteTeam, addTeamMember, setMemberRole, removeTeamMember,
  setContactDetails, type TeamMemberRole, type ActionResult,
} from "./actions";

export type DirMember = {
  memberId: string;
  profileId: string;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  memberRole: TeamMemberRole;
};
export type DirTeam = { id: string; name: string; members: DirMember[] };
export type DirPerson = { id: string; name: string; email: string };

const notify = (r: ActionResult) => { r.ok ? toast.success(r.message) : toast.error(r.message); return r; };

const ROLE_META: Record<TeamMemberRole, { label: string; node: React.ReactNode }> = {
  lead: { label: "Team Lead", node: <Badge className="gap-1 bg-maaef-red/10 text-maaef-red"><Crown className="h-3 w-3" /> Team Lead</Badge> },
  hr: { label: "HR", node: <Badge variant="secondary" className="gap-1"><HeartHandshake className="h-3 w-3" /> HR</Badge> },
  member: { label: "Member", node: <Badge variant="muted">Member</Badge> },
};

export function TeamsAdmin({ teams, people }: { teams: DirTeam[]; people: DirPerson[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => { const r = notify(await fn()); if (r.ok) router.refresh(); });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-maaef-red" /> Departments &amp; directory
          <InfoTip k="admin.teams" />
        </CardTitle>
        <CardDescription>
          Build teams, assign a Team Lead and HR, add members, and keep everyone&apos;s contact
          details current. Each member sees their department on their Dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Create team */}
        <form
          action={(fd) => run(() => createTeam(fd))}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="new-team">New team</Label>
            <Input id="new-team" name="name" placeholder="e.g. Sales, Design, Operations" required />
          </div>
          <Button type="submit" disabled={pending}><Plus className="h-4 w-4" /> Add team</Button>
        </form>

        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet. Create one above.</p>
        ) : (
          <div className="space-y-4">
            {teams.map((t) => (
              <div key={t.id} className="rounded-xl border">
                <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
                  <div className="flex items-center gap-2 font-semibold">{t.name}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {t.members.length} {t.members.length === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <RenameTeamDialog team={t} onDone={() => router.refresh()} />
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      title="Delete team" disabled={pending}
                      onClick={() => { if (confirm(`Delete team “${t.name}”? Members are not deleted, just unassigned.`)) run(() => deleteTeam(t.id)); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="divide-y">
                  {t.members.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No members yet.</p>
                  )}
                  {t.members.map((m) => (
                    <div key={m.memberId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{m.name}</span>
                          {ROLE_META[m.memberRole].node}
                          {m.title && <span className="text-xs text-muted-foreground">{m.title}</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {m.email}</span>
                          {m.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {m.phone}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          value={m.memberRole}
                          disabled={pending}
                          onChange={(e) => run(() => setMemberRole(m.memberId, e.target.value as TeamMemberRole))}
                        >
                          <option value="lead">Team Lead</option>
                          <option value="hr">HR</option>
                          <option value="member">Member</option>
                        </select>
                        <EditContactDialog member={m} onDone={() => router.refresh()} />
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          title="Remove from team" disabled={pending}
                          onClick={() => run(() => removeTeamMember(m.memberId))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add member */}
                <div className="border-t bg-muted/20 px-4 py-2.5">
                  <AddMemberForm teamId={t.id} people={people} existing={t.members.map((m) => m.profileId)} onDone={() => router.refresh()} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddMemberForm({
  teamId, people, existing, onDone,
}: { teamId: string; people: DirPerson[]; existing: string[]; onDone: () => void }) {
  const [pending, start] = React.useTransition();
  const available = people.filter((p) => !existing.includes(p.id));

  return (
    <form
      action={(fd) => {
        fd.set("team_id", teamId);
        start(async () => { const r = notify(await addTeamMember(fd)); if (r.ok) onDone(); });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="min-w-[180px] flex-1 space-y-1">
        <Label className="text-xs text-muted-foreground">Add person</Label>
        <select name="profile_id" required disabled={pending || available.length === 0}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
          <option value="">{available.length ? "— Select —" : "Everyone is already on this team"}</option>
          {available.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">As</Label>
        <select name="member_role" defaultValue="member" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="member">Member</option>
          <option value="lead">Team Lead</option>
          <option value="hr">HR</option>
        </select>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending || available.length === 0}>
        <UserPlus className="h-4 w-4" /> Add
      </Button>
    </form>
  );
}

function RenameTeamDialog({ team, onDone }: { team: DirTeam; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Rename team">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={(fd) => { fd.set("team_id", team.id); start(async () => { const r = notify(await renameTeam(fd)); if (r.ok) { setOpen(false); onDone(); } }); }}>
          <DialogHeader>
            <DialogTitle>Rename team</DialogTitle>
            <DialogDescription>Change the department name shown to everyone.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor={`rt-${team.id}`}>Team name</Label>
            <Input id={`rt-${team.id}`} name="name" defaultValue={team.name} required className="mt-1.5" />
          </div>
          <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditContactDialog({ member, onDone }: { member: DirMember; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Edit contact details">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={(fd) => { fd.set("user_id", member.profileId); start(async () => { const r = notify(await setContactDetails(fd)); if (r.ok) { setOpen(false); onDone(); } }); }}>
          <DialogHeader>
            <DialogTitle>Contact details — {member.name}</DialogTitle>
            <DialogDescription>Shown in the directory on this person&apos;s teammates&apos; dashboards.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="space-y-1.5">
              <Label htmlFor={`ph-${member.memberId}`}>Phone</Label>
              <Input id={`ph-${member.memberId}`} name="phone" defaultValue={member.phone ?? ""} placeholder="+91 …" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ti-${member.memberId}`}>Designation / title</Label>
              <Input id={`ti-${member.memberId}`} name="title" defaultValue={member.title ?? ""} placeholder="e.g. Sales Manager" />
            </div>
          </div>
          <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
