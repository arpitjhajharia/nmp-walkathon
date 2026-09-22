import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader eyebrow={user.email} title="Account">
        If your admin gave you a temporary password, change it here.
      </PageHeader>
      <Card className="p-5">
        <PasswordForm />
      </Card>
    </div>
  );
}
