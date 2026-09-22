import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/server/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const admin = await requireAdmin();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader eyebrow={admin.name} title="Account">
        If your admin gave you a temporary password, change it here.
      </PageHeader>
      <Card className="p-5">
        <PasswordForm />
      </Card>
    </div>
  );
}
