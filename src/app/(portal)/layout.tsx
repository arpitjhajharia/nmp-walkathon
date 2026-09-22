import { signOut } from "@/app/actions/auth";
import { diffDays } from "@/lib/engine/dates";
import { Nav } from "@/components/nav";
import { canEnterSteps, requireUser } from "@/lib/server/auth";
import { getPortal } from "@/lib/server/season";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { season } = getPortal();
  const leadTeam = season.teams.find((t) => t.id === user.leadTeamId);
  const roleLabel = [user.isAdmin ? "Admin" : null, leadTeam ? `Team lead · ${leadTeam.name}` : null].filter(Boolean).join(" · ") || "Participant";
  const dayLabel =
    season.phase === "pre" ? `Starts in ${diffDays(season.today, season.start)} days` : season.phase === "finished" ? "Season complete" : `Day ${season.dayNumber} of ${season.settings.lengthDays}`;
  return (
    <>
      <Nav userName={user.name} roleLabel={roleLabel} canEnter={canEnterSteps(user)} isAdmin={user.isAdmin} dayLabel={dayLabel} signOut={signOut} />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:pt-8 lg:pb-16">
        {children}
      </main>
    </>
  );
}
