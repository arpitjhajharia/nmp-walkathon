import { Flag, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { FixtureCard } from "@/components/fixture-card";
import { TeamBadge } from "@/components/team";
import { Card, Chip, PageHeader, SectionTitle } from "@/components/ui";
import { diffDays, formatRange } from "@/lib/engine/dates";
import { CHALLENGE_TYPES, type TrophyRace } from "@/lib/engine/engine";
import type { Team } from "@/lib/engine/types";
import { requireUser } from "@/lib/server/auth";
import { getPortal } from "@/lib/server/season";

export const metadata: Metadata = { title: "Schedule" };

function RaceCard({ race, teams, today, icon }: { race: TrophyRace; teams: Map<string, Team>; today: string; icon: React.ReactNode }) {
  const leader = race.totals[0];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <p className="font-display text-lg font-bold uppercase leading-tight">{race.label}</p>
            <p className="text-xs text-muted">{formatRange(race.start, race.end)}</p>
          </div>
        </div>
        {race.status === "completed" ? (
          <Chip tone="good">Awarded</Chip>
        ) : race.status === "live" ? (
          <Chip tone="live">{diffDays(today, race.end) + 1} days left</Chip>
        ) : (
          <Chip>Starts in {diffDays(today, race.start)} days</Chip>
        )}
      </div>
      {race.status === "completed" ? (
        <p className="mt-3 text-sm">
          <span className="text-muted">Winner: </span>
          {race.winners.length ? (
            race.winners.map((id) => <TeamBadge key={id} team={teams.get(id)!} size="sm" className="mr-2 align-middle" />)
          ) : (
            <span className="font-semibold">No points recorded</span>
          )}
        </p>
      ) : race.status === "live" && leader && leader.points > 0 ? (
        <ol className="mt-3 space-y-1">
          {race.totals.map((t, i) => (
            <li key={t.teamId} className="tnum flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-4 text-muted">{i + 1}</span>
                <TeamBadge team={teams.get(t.teamId)!} size="sm" />
              </span>
              <span className="font-semibold">{t.points} pts</span>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}

export default async function SchedulePage() {
  const user = await requireUser();
  const { season: s } = await getPortal();
  const teams = new Map(s.teams.map((t) => [t.id, t]));
  const current = s.currentWeek;
  const challengeFor = (i: number) => s.challenges.find((c) => c.weekIndex === i);
  const upcoming = s.weeks.filter((w) => w.status === "upcoming");
  const completed = s.weeks.filter((w) => w.status === "completed").reverse();

  return (
    <>
      <PageHeader eyebrow={`${s.weeks.length} weeks · ${s.fixtures.length} fixtures`} title="Fixtures & schedule">
        Every Monday to Sunday, each team plays one head-to-head fixture. The schedule rotates so every team meets every other team regularly.
      </PageHeader>

      {current && (
        <section className="mb-10">
          <SectionTitle title={current.status === "live" ? "This week" : current.status === "upcoming" ? "Opening week" : "Final week"} sub={`Week ${current.number} · ${formatRange(current.start, current.end)}${challengeFor(current.index) ? ` · Challenge: ${challengeFor(current.index)!.title}` : ""}`} />
          <div className="grid gap-3 md:grid-cols-2">
            {s.fixtures
              .filter((f) => f.week.index === current.index)
              .map((f) => (
                <FixtureCard key={f.id} f={f} teams={teams} highlightTeamId={user.teamId ?? undefined} />
              ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <SectionTitle title="Trophies" sub="Separate from league points: a fresh chance for every team." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RaceCard race={s.finalSprint} teams={teams} today={s.today} icon={<Flag className="size-5 text-accent-ink" aria-hidden="true" />} />
          {s.monthlyCups.map((c) => (
            <RaceCard key={c.key} race={{ ...c, label: `${c.label} Cup` }} teams={teams} today={s.today} icon={<Trophy className="size-5 text-accent-ink" aria-hidden="true" />} />
          ))}
        </div>
      </section>

      {upcoming.length > 0 && (
        <section className="mb-10">
          <SectionTitle title="Upcoming" />
          <Card className="divide-y divide-line-2">
            {upcoming.map((w) => (
              <div key={w.index} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="w-44 shrink-0">
                  <p className="font-display text-base font-bold uppercase">
                    Week {w.number}
                    {w.finalSprint && <span className="ml-1.5 text-accent-ink">· Sprint</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {formatRange(w.start, w.end)}
                    {w.dates.length < 7 && ` · ${w.dates.length}-day week`}
                  </p>
                </div>
                <ul className="flex flex-1 flex-wrap gap-x-6 gap-y-1.5">
                  {s.fixtures
                    .filter((f) => f.week.index === w.index)
                    .map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-sm">
                        <TeamBadge team={teams.get(f.home.teamId)!} size="sm" />
                        <span className="text-xs font-semibold text-muted">v</span>
                        <TeamBadge team={teams.get(f.away.teamId)!} size="sm" />
                      </li>
                    ))}
                </ul>
                {challengeFor(w.index) && <Chip className="self-start sm:self-center">{CHALLENGE_TYPES[challengeFor(w.index)!.type].title}</Chip>}
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle title="Results" />
        {completed.length === 0 ? (
          <p className="text-sm text-muted">Results appear here after the first week.</p>
        ) : (
          <Card className="divide-y divide-line-2">
            {completed.map((w) => (
              <div key={w.index} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="w-44 shrink-0">
                  <p className="font-display text-base font-bold uppercase">Week {w.number}</p>
                  <p className="text-xs text-muted">
                    {formatRange(w.start, w.end)}
                    {w.provisional && " · provisional"}
                  </p>
                </div>
                <ul className="grid flex-1 gap-1.5 lg:grid-cols-2">
                  {s.fixtures
                    .filter((f) => f.week.index === w.index)
                    .map((f) => {
                      const h = teams.get(f.home.teamId)!;
                      const a = teams.get(f.away.teamId)!;
                      return (
                        <li key={f.id} className="tnum flex items-center gap-2 text-sm">
                          <span className={f.outcome === h.id ? "font-bold" : ""}>
                            <TeamBadge team={h} size="sm" />
                          </span>
                          <span className="font-display text-lg font-bold">
                            {f.home.points}–{f.away.points}
                          </span>
                          <TeamBadge team={a} size="sm" />
                          <span className="ml-auto text-xs font-semibold text-muted lg:ml-2">{f.outcome === "draw" ? "Draw" : `${teams.get(f.outcome!)!.name} win`}</span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </Card>
        )}
      </section>
    </>
  );
}
