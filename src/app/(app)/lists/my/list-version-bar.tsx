"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { GitBranchPlus, Pencil, Lock, TimerReset, Archive } from "lucide-react";
import type { PriceList } from "@/lib/lists";
import {
  selectList,
  createVersion,
  renameList,
  resetListToCreation,
  archiveList,
} from "../list-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function ListVersionBar({
  lists,
  currentList,
  canEdit,
}: {
  lists: PriceList[];
  currentList: PriceList;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <Label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        Working list <InfoTip k="mylist.workingList" />
      </Label>
      <Select
        value={currentList.id}
        onValueChange={(id) =>
          start(async () => {
            const r = await selectList(id);
            if (r.ok) router.refresh();
            else toast.error(r.message);
          })
        }
      >
        <SelectTrigger className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {lists.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              <span className="flex items-center gap-2">
                {(l.locked || l.is_original) && <Lock className="h-3 w-3 text-muted-foreground" />}
                {l.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(currentList.locked || currentList.is_original) && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> locked — edits create a copy
        </span>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {canEdit && (
          <span className="flex items-center gap-1">
            <NewVersionDialog defaultName={`${currentList.name} — copy`} />
            <InfoTip k="mylist.newVersion" />
          </span>
        )}
        {canEdit && !currentList.is_original && (
          <>
            <span className="flex items-center gap-1">
              <RenameDialog listId={currentList.id} currentName={currentList.name} />
              <InfoTip k="mylist.rename" />
            </span>
            <span className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await resetListToCreation();
                    if (r.ok) {
                      toast.success(r.message);
                      router.refresh();
                    } else toast.error(r.message);
                  })
                }
              >
                <TimerReset className="h-4 w-4" /> Reset
              </Button>
              <InfoTip k="mylist.reset" />
            </span>
            <span className="flex items-center gap-1">
              <ArchiveDialog listId={currentList.id} listName={currentList.name} />
              <InfoTip k="mylist.archive" />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ArchiveDialog({ listId, listName }: { listId: string; listName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Archive className="h-4 w-4" /> Archive
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive “{listName}”?</DialogTitle>
          <DialogDescription>
            The list disappears from every screen and picker. The original is unaffected
            and stays available. This does not delete data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await archiveList(listId);
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.message);
              })
            }
          >
            {pending ? "Archiving…" : "Archive list"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewVersionDialog({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(defaultName);
  const [pending, start] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setName(defaultName); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <GitBranchPlus className="h-4 w-4" /> New version
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New working version</DialogTitle>
          <DialogDescription>
            Copies the current list into a new, editable list. The original is never touched.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="ver-name">List name</Label>
          <Input id="ver-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createVersion(name);
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.message);
              })
            }
          >
            {pending ? "Creating…" : "Create & switch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ listId, currentName }: { listId: string; currentName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(currentName);
  const [pending, start] = React.useTransition();

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setName(currentName); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="h-4 w-4" /> Rename
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename list</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await renameList(listId, name);
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.message);
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
