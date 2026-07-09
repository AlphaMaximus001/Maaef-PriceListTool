"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Phone, PenLine, Trash2 } from "lucide-react";
import { savePhone, uploadSignature, removeSignature } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileClient({
  phone,
  signatureUrl,
}: {
  phone: string;
  signatureUrl: string | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-maaef-red" /> Phone
          </CardTitle>
          <CardDescription>Shown in the PDF footer next to your email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={(fd) =>
              start(async () => {
                const r = await savePhone(fd);
                r.ok ? toast.success(r.message) : toast.error(r.message);
                if (r.ok) router.refresh();
              })
            }
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" name="phone" defaultValue={phone} placeholder="+91 …" />
            </div>
            <Button type="submit" disabled={pending}>Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-maaef-red" /> Signature
          </CardTitle>
          <CardDescription>
            Upload a PNG/JPG of your signature (transparent PNG looks best). Under 2 MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {signatureUrl ? (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureUrl}
                alt="Your signature"
                className="h-16 rounded border bg-white object-contain p-1"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await removeSignature();
                    r.ok ? toast.success(r.message) : toast.error(r.message);
                    if (r.ok) router.refresh();
                  })
                }
              >
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No signature uploaded yet.</p>
          )}

          <form
            action={(fd) =>
              start(async () => {
                const r = await uploadSignature(fd);
                r.ok ? toast.success(r.message) : toast.error(r.message);
                if (r.ok) router.refresh();
              })
            }
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="signature">Signature image</Label>
              <Input id="signature" name="signature" type="file" accept="image/png,image/jpeg" required />
            </div>
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
