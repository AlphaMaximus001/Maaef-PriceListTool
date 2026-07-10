import Link from "next/link";
import { requireSession, type Capability } from "@/lib/capabilities";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { Check, X } from "lucide-react";

const CAP_LABELS: Record<Capability, string> = {
  view_cost: "View cost floor",
  view_margin: "View MP & MUSP",
  edit_specs: "Edit product details",
  edit_price: "Edit prices",
  bulk_edit: "Bulk / category edit",
  upload_competitor: "Upload competitor lists",
  confirm_match: "Confirm matches",
  export_pdf: "Export branded PDF",
  manage_users: "Manage users",
  manage_documents: "Manage documents",
};

const PHASES: { n: number; name: string; status: "live" | "next" | "planned" }[] = [
  { n: 1, name: "Auth + permissions + Admin", status: "live" },
  { n: 2, name: "Intake + list display", status: "live" },
  { n: 3, name: "Matching + overlap / unique views", status: "live" },
  { n: 4, name: "Edit engine + audit + undercut guard", status: "live" },
  { n: 5, name: "SKU configurator", status: "live" },
  { n: 6, name: "Branded PDF export", status: "live" },
];

export default async function DashboardPage() {
  const { profile, can } = await requireSession();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}.
        </h1>
        <p className="mt-1 text-muted-foreground">
          Where you overlap with competitors — and where you&apos;re unique.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Your access <InfoTip k="dashboard.access" />
            </CardTitle>
            <CardDescription>
              Resolved through <code className="text-xs">has_capability()</code> —
              role default, overridden per-person by an admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Role</span>
              <Badge variant="secondary" className="capitalize">
                {profile.role}
              </Badge>
            </div>
            <ul className="space-y-1.5">
              {(Object.keys(CAP_LABELS) as Capability[]).map((cap) => (
                <li key={cap} className="flex items-center gap-2 text-sm">
                  {can[cap] ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground/50" />
                  )}
                  <span className={can[cap] ? "" : "text-muted-foreground"}>
                    {CAP_LABELS[cap]}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Build roadmap <InfoTip k="dashboard.roadmap" />
            </CardTitle>
            <CardDescription>Phases ship in order; each is usable before the next.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {PHASES.map((p) => (
                <li key={p.n} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {p.n}
                  </span>
                  <span className="flex-1">{p.name}</span>
                  {p.status === "live" && <Badge variant="success">Live</Badge>}
                  {p.status === "next" && <Badge>Next</Badge>}
                  {p.status === "planned" && <Badge variant="muted">Planned</Badge>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {can.manage_users && (
        <Card>
          <CardHeader>
            <CardTitle>Admin</CardTitle>
            <CardDescription>
              Manage users, roles, and per-person capability grants.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/admin">Open Admin</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
