import { redirect } from "next/navigation";
import { getSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { getLists } from "@/lib/lists";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, User, Users, Crown, HeartHandshake } from "lucide-react";
import {
  PinnedListCard,
  PinnedSkuCard,
  NotesCard,
  QuickDocsCard,
} from "./dashboard-client";

export const dynamic = "force-dynamic";

type MemberRole = "lead" | "hr" | "member";
type DirEntry = {
  profileId: string;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  memberRole: MemberRole;
};

const employeeCode = (firstName: string | null, onboard: number | null) => {
  const letters = (firstName ?? "").replace(/[^A-Za-z]/g, "") || "X";
  const lenLetter = String.fromCharCode(64 + Math.min(Math.max(letters.length, 1), 26));
  return `M${letters[0].toUpperCase()}E${lenLetter}${String(onboard ?? 99).padStart(2, "0")}`;
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { profile } = session;

  const supabase = await createClient();

  // ── Self details ────────────────────────────────────────────────────────────
  const { data: me } = await supabase
    .from("profiles")
    .select("id, email, full_name, first_name, surname, role, phone, title, onboard_no")
    .eq("id", profile.id)
    .maybeSingle();

  const myCode = employeeCode(me?.first_name ?? null, me?.onboard_no ?? null);

  // ── Department directory: which team(s) am I in, and who's on them? ──────────
  const { data: myMemberships } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("profile_id", profile.id);
  const teamIds = (myMemberships ?? []).map((m) => m.team_id as string);

  type Team = { id: string; name: string; entries: DirEntry[] };
  const teams: Team[] = [];
  if (teamIds.length) {
    const [{ data: teamRows }, { data: memberRows }] = await Promise.all([
      supabase.from("teams").select("id, name").in("id", teamIds),
      supabase
        .from("team_members")
        .select("team_id, member_role, profiles(id, full_name, email, phone, title)")
        .in("team_id", teamIds),
    ]);

    for (const t of (teamRows as { id: string; name: string }[]) ?? []) {
      const entries: DirEntry[] = ((memberRows as unknown as Array<{
        team_id: string; member_role: MemberRole;
        profiles: { id: string; full_name: string | null; email: string; phone: string | null; title: string | null } | null;
      }>) ?? [])
        .filter((r) => r.team_id === t.id && r.profiles)
        .map((r) => ({
          profileId: r.profiles!.id,
          name: r.profiles!.full_name || r.profiles!.email,
          email: r.profiles!.email,
          phone: r.profiles!.phone,
          title: r.profiles!.title,
          memberRole: r.member_role,
        }));
      // Order: lead, hr, then members alphabetically.
      const rank: Record<MemberRole, number> = { lead: 0, hr: 1, member: 2 };
      entries.sort((a, b) => rank[a.memberRole] - rank[b.memberRole] || a.name.localeCompare(b.name));
      teams.push({ id: t.id, name: t.name, entries });
    }
  }

  // ── Pins + notes ────────────────────────────────────────────────────────────
  const { data: prefs } = await supabase
    .from("dashboard_prefs")
    .select("pinned_list_id, pinned_product_id, notes")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const lists = await getLists();
  const pinnedList = prefs?.pinned_list_id
    ? lists.find((l) => l.id === prefs.pinned_list_id) ?? null
    : null;

  let pinnedSku: { id: string; sku: string; name: string; price: number; currency: string; listName: string } | null = null;
  if (prefs?.pinned_product_id) {
    const { data: p } = await supabase
      .from("my_products")
      .select("id, sku, product_name, display_name, price, currency, active, price_lists(name)")
      .eq("id", prefs.pinned_product_id)
      .maybeSingle();
    const row = p as unknown as {
      id: string; sku: string; product_name: string; display_name: string | null;
      price: number; currency: string; active: boolean; price_lists: { name: string } | null;
    } | null;
    if (row && row.active) {
      pinnedSku = {
        id: row.id, sku: row.sku, name: row.display_name || row.product_name,
        price: Number(row.price), currency: row.currency, listName: row.price_lists?.name ?? "—",
      };
    }
  }

  // ── Quick documents ─────────────────────────────────────────────────────────
  const { data: docRows } = await supabase
    .from("documents")
    .select("id, title, category, file_path")
    .order("uploaded_at", { ascending: false })
    .limit(12);
  const docs = ((docRows as Array<{ id: string; title: string; category: string | null; file_path: string }>) ?? []).map(
    (d) => ({ id: d.id, title: d.title, category: d.category, filePath: d.file_path }),
  );

  const listChoices = lists.map((l) => ({ id: l.id, name: l.name, is_original: l.is_original }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{me?.first_name ? `, ${me.first_name}` : ""}.
        </h1>
        <p className="mt-1 text-muted-foreground">Your details, your team, and the things you use most.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Self details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-maaef-red" /> Your details
            </CardTitle>
            <CardDescription>Your profile as it appears to the team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name" value={me?.full_name || "—"} />
            <Row label="Designation" value={me?.title || "—"} />
            <Row label="Role" value={<Badge variant="secondary" className="capitalize">{me?.role}</Badge>} />
            <Row label="Email" value={me?.email || "—"} />
            <Row label="Phone" value={me?.phone || "—"} />
            <Row label="Employee ID" value={<span className="font-mono">{myCode}</span>} />
            <Row label="Department" value={teams.length ? teams.map((t) => t.name).join(", ") : "Not assigned"} />
            <p className="pt-1 text-xs text-muted-foreground">
              Name, designation and contact details are maintained by your admin.
            </p>
          </CardContent>
        </Card>

        {/* Department directory */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-maaef-red" /> Your department
            </CardTitle>
            <CardDescription>Who to reach, and how.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You haven&apos;t been added to a team yet. An admin can add you from the Admin page.
              </p>
            ) : (
              teams.map((t) => (
                <div key={t.id} className="space-y-2">
                  {teams.length > 1 && <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.name}</div>}
                  {t.entries.map((e) => (
                    <div key={e.profileId} className="rounded-lg border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">{e.name}</span>
                          <RoleBadge role={e.memberRole} />
                        </div>
                        {e.title && <span className="shrink-0 text-xs text-muted-foreground">{e.title}</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <a href={`mailto:${e.email}`} className="flex items-center gap-1 hover:text-foreground">
                          <Mail className="h-3.5 w-3.5" /> {e.email}
                        </a>
                        {e.phone && (
                          <a href={`tel:${e.phone}`} className="flex items-center gap-1 hover:text-foreground">
                            <Phone className="h-3.5 w-3.5" /> {e.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <PinnedListCard lists={listChoices} pinned={pinnedList ? { id: pinnedList.id, name: pinnedList.name } : null} />
        <PinnedSkuCard pinned={pinnedSku} />
        <NotesCard initial={prefs?.notes ?? ""} />
        <QuickDocsCard docs={docs} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function RoleBadge({ role }: { role: MemberRole }) {
  if (role === "lead")
    return <Badge className="gap-1 bg-maaef-red/10 text-maaef-red"><Crown className="h-3 w-3" /> Team Lead</Badge>;
  if (role === "hr")
    return <Badge variant="secondary" className="gap-1"><HeartHandshake className="h-3 w-3" /> HR</Badge>;
  return <Badge variant="muted">Member</Badge>;
}
