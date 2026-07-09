import { requireSession } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("phone, signature_path")
    .eq("id", profile.id)
    .single();

  // A short-lived signed URL so the user can preview their current signature.
  let signatureUrl: string | null = null;
  if (data?.signature_path) {
    const { data: signed } = await supabase.storage
      .from("signatures")
      .createSignedUrl(data.signature_path, 300);
    signatureUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
        <p className="mt-1 text-muted-foreground">
          Your phone and signature are embedded in the footer of PDFs you generate.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>From your login — not editable here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{profile.full_name || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{profile.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary" className="capitalize">{profile.role}</Badge>
          </div>
        </CardContent>
      </Card>

      <ProfileClient phone={data?.phone ?? ""} signatureUrl={signatureUrl} />
    </div>
  );
}
