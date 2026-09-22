import type { Metadata } from "next";
import { StandingsTable } from "@/components/standings-table";
import { TeamBadge } from "@/components/team";
import { Card, PageHeader, SectionTitle, compact, fmt } from "@/components/ui";
import { formatRange } from "@/lib/engine/dates";
import { requireUser } from "@/lib/server/auth";
import { getPortal } from "@/lib/server/season";

export const metadata: Metadata = { title: "Standings" };

export default async function StandingsPage() {
  const user = await requireUser();
  const { season: s } = getPortal();
  const teams = new Map(s.teams.map((t) => [t.id, t]));
  const last = s.lastCompletedWeek;
  const live = s.fixtures.filter((f) => f.status === "live");

  return (
    <>
      <PageHeader eyebrow={last ? `After week ${last.number} · ${formatRange(last.start, last.end)}` : "Season table"} title="Standings">
        Win your weekly fixture for 2 league points; a draw earns 1. The table updates automatically when a week ends on Sunday.
      </PageHeader>

      {last?.provisional && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-950 ring-1 ring-amber-200">
          Week {last.number} results are provisional until corrections close at 11:59 PM tonight.
        </p>
      )}

      <Card className="p-0 sm:p-2">
        <StandingsTable rows={s.standings} teams={teams} full highlightTeamId={user.teamId} />
      </Card>

      <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">
        <div><dt className="inline font-semibold text-ink-2">Ranking order: </dt><dd className="inline">league points, then fixtures won, then total activity points, then total steps.</dd></div>
        <div><dt className="inline font-semibold text-ink-2">Form: </dt><dd className="inline">last five results, oldest first (W win, D draw, L loss).</dd></div>
        <div><dt className="inline font-semibold text-ink-2">Activity pts: </dt><dd className="inline">all daily team points earned in completed weeks.</dd></div>
        <div><dt className="inline font-semibold text-ink-2">Move: </dt><dd className="inline">change in position since the previous completed week.</dd></div>
      </dl>

      {live.length > 0 && (
        <section className="mt-10">
          <SectionTitle title="Live this week" sub="Not in the table until Sunday's final whistle." action={{ href: "/schedule", label: "Schedule" }} />
          <div className="grid gap-3 sm:grid-cols-2">
            {live.map((f) => (
              <Card key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <TeamBadge team={teams.get(f.home.teamId)!} size="sm" />
                <span className="tnum font-display text-2xl font-bold">
                  {f.home.points}<span className="px-1.5 text-muted">–</span>{f.away.points}
                </span>
                <TeamBadge team={teams.get(f.away.teamId)!} size="sm" className="flex-row-reverse" />
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <SectionTitle title="Season totals" sub="Everything recorded so far, including the current week." />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {s.teams.map((t) => {
            const pts = s.countedDates.reduce((sum, d) => sum + s.teamDay(t.id, d).earned, 0);
            const steps = s.countedDates.reduce((sum, d) => sum + s.teamDay(t.id, d).steps, 0);
            return (
              <Card key={t.id} className="p-4">
                <TeamBadge team={t} size="sm" link />
                <p className="tnum mt-3 font-display text-3xl font-bold">{fmt(pts)}</p>
                <p className="text-xs text-muted">team points · {compact(steps)} steps</p>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}
