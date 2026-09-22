import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Nav } from "@/components/nav";
import { diffDays } from "@/lib/engine/dates";
import { currentAdmin } from "@/lib/server/auth";
import { getPortal } from "@/lib/server/season";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [admin, { season }] = await Promise.all([currentAdmin(), getPortal()]);
  const dayLabel =
    season.phase === "pre" ? `Starts in ${diffDays(season.today, season.start)} days` : season.phase === "finished" ? "Season complete" : `Day ${season.dayNumber} of ${season.settings.lengthDays}`;
  return (
    <>
      <Nav adminName={admin?.name ?? null} dayLabel={dayLabel} signOut={signOut} />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:pt-8 lg:pb-16">
        {children}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-28 text-center text-xs text-muted lg:pb-10">
        {admin ? (
          <>Signed in as {admin.name} (admin)</>
        ) : (
          <Link href="/login" className="underline-offset-2 hover:underline">
            Admin sign-in
          </Link>
        )}
      </footer>
    </>
  );
}
