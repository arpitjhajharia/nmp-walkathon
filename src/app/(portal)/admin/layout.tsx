import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/server/auth";
import { isDemoMode } from "@/lib/supabase/env";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <PageHeader eyebrow={isDemoMode() ? "Admin · demo mode" : "Admin"} title="Run the season" />
      <AdminNav />
      {children}
    </>
  );
}
