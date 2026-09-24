import { Award, Crown, Flag, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FixtureCard } from "@/components/fixture-card";
import { TeamBadge, TeamIcon } from "@/components/team";
import { Avatar, Card, Chip, EmptyState, FormGuide, SectionTitle, compact, fmt } from "@/components/ui";
import { formatRange, weekdayShort } from "@/lib/engine/dates";
import { getPortal } from "@/lib/server/season";

export async function generateMetadata({ params }: PageProps<"/teams/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const t = (await getPortal()).season.teams.find((x) => x.slug === slug);
  return { title: t?.name ?? "Team" };
}

export default async function TeamPage({ params }: PageProps<"/teams/[slug]">) {
  const { slug } = await params;
  const { season: s, nameOf } = await getPortal();
  const team = s.teams.find((t) => t.slug === slug);
  if (!team) notFound();
  const teams = new Map(s.teams.map((t) => [t.id, t]));
  const members = [...(s.membersByTeam.get(team.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const row = s.standings.find((r) => r.teamId === team.id)!;
  const week = s.currentWeek;
  const fixture = week ? s.fixtures.find((f) => f.week.index === week.index && (f.home.teamId === team.id || f.away.teamId === team.id)) : undefined;

  const weekDays = week ? week.dates.map((d) => ({ d, ...s.teamDay(team.id, d), future: d > s.lastCounted })) : [];
  let activeDays = 0,
    possibleDays = 0;
  for (const d of weekDays.filter((x) => !x.future))
    for (const m of s.rosterOn(team.id, d.d)) {
      const md = s.memberDay(m.id, d.d);
      if (md.leave) continue;
      possibleDays++;
      if ((md.steps ?? 0) >= s.activeSteps) activeDays++;
    }
  const participation = possibleDays ? Math.round((activeDays / possibleDays) * 100) : 0;
  const weekEarned = weekDays.reduce((a, x) => a + x.earned, 0);
  const weekPossible = weekDays.filter((x) => !x.future).reduce((a, x) => a + x.possible, 0);

  const results = s.fixtures.filter((f) => f.status === "completed" && (f.home.teamId === team.id || f.away.teamId === team.id)).slice(-5).reverse();
  const cups = s.monthlyCups.filter((c) => c.winners.includes(team.id));
  const awardCount = { mvp: 0, consistency: 0, comeback: 0, teamPlayer: 0 };
  for (const a of s.weeklyAwards.filter((x) => x.final)) {
    const weekEnd = s.weeks[a.weekIndex].end;
    for (const k of Object.keys(awardCount) as (keyof typeof awardCount)[]) if (a[k].some((w) => s.teamOf(w.userId, weekEnd) === team.id)) awardCount[k]++;
  }
  const maxBar = Math.max(s.maxDaily * members.length, ...weekDays.map((x) => x.possible)) || 1;

  // Contributions count only days spent on this team, so people who moved keep their credit here.
  const currentIds = new Set(members.map((m) => m.id));
  const everyone = [...new Set([...s.memberships.values()].flat().filter((ms) => ms.teamId === team.id).map((ms) => ms.userId))];
  const contributions = everyone
    .map((id) => {
      const days = s.countedDates.filter((d) => s.teamOf(id, d) === team.id).map((d) => s.memberDay(id, d));
      return {
        id,
        name: nameOf(id),
        current: currentIds.has(id),
        activeDays: days.filter((d) => (d.steps ?? 0) >= s.activeSteps).length,
        points: days.reduce((a, d) => a + d.points, 0),
        steps: days.reduce((a, d) => a + (d.steps ?? 0), 0),
      };
    })
    .filter((c) => c.current || c.points > 0 || c.steps > 0)
    .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));

  return (
    <>
      <header className="mb-8 overflow-hidden rounded-3xl bg-night text-white">
        <div className="h-2" style={{ backgroundColor: team.color }} />
        <div className="flex flex-wrap items-center gap-5 px-5 py-6 sm:px-8">
          <TeamIcon team={team} size="xl" />
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-white/60">Team</p>
            <h1 className="break-words font-display text-4xl font-bold uppercase leading-none sm:text-5xl">{team.name}</h1>
            <p className="mt-1 text-sm text-white/70">Captain: {team.leadUserId ? nameOf(team.leadUserId) : "Not chosen yet"}</p>
          </div>
          <dl className="tnum flex w-full gap-6 border-t border-white/10 pt-4 sm:w-auto sm:border-0 sm:pt-0 sm:text-center">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-white/60">Position</dt>
              <dd className="font-display text-4xl font-bold text-accent">#{row.position}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-white/60">League pts</dt>
              <dd className="font-display text-4xl font-bold">{row.points}</dd>
            </div>
            <div className="hidden sm:block">
              <dt className="text-xs font-semibold uppercase tracking-wider text-white/60">Form</dt>
              <dd className="pt-2.5">
                <FormGuide form={row.form} />
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle title="Current fixture" />
          {fixture ? <FixtureCard f={fixture} teams={teams} /> : <EmptyState title="No fixture this week" />}
        </section>

        <section>
          <SectionTitle title="This week" sub={week ? `${formatRange(week.start, week.end)} · ${weekEarned} of ${weekPossible} possible points so far` : undefined} />
          <Card className="p-5">
            <div className="flex items-end gap-2" role="list" aria-label="Daily team points this week">
              {weekDays.map((x) => (
                <div key={x.d} role="listitem" className="flex flex-1 flex-col items-center gap-1" aria-label={`${weekdayShort(x.d)}: ${x.future ? "upcoming" : `${x.earned} of ${x.possible} points`}`}>
                  <span className="tnum text-xs font-semibold text-ink-2" aria-hidden="true">{x.future ? "" : x.earned}</span>
                  <div className="relative flex h-24 w-full max-w-10 items-end overflow-hidden rounded-md bg-line-2" aria-hidden="true">
                    <div className="w-full rounded-md" style={{ height: `${x.future ? 0 : (x.earned / maxBar) * 100}%`, backgroundColor: team.color }} />
                  </div>
                  <span className={`text-xs ${x.d === s.lastCounted ? "font-bold text-ink" : "text-muted"}`} aria-hidden="true">{weekdayShort(x.d)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line-2 pt-3 text-sm">
              <span className="text-muted">Participation this week</span>
              <span className="tnum font-display text-2xl font-bold">{participation}%</span>
            </div>
            <p className="text-xs text-muted">Share of member-days (excluding leave) with 5,000+ steps.</p>
          </Card>
        </section>
      </div>

      <section className="mt-10">
        <SectionTitle title="Members" sub="Listed alphabetically. Totals count days spent on this team." />
        <Card className="overflow-x-auto">
          <table className="tnum w-full min-w-[480px] text-sm">
            <caption className="sr-only">Member contributions</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-2.5">Member</th>
                <th scope="col" className="px-3 py-2.5 text-right">Days active</th>
                <th scope="col" className="px-3 py-2.5 text-right">Points contributed</th>
                <th scope="col" className="px-4 py-2.5 text-right">Total steps</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((c) => (
                <tr key={c.id} className="border-b border-line-2 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={c.name} color={c.current ? team.color : undefined} />
                      <Link href={`/players/${c.id}`} className={`font-semibold hover:underline ${c.current ? "" : "text-muted"}`}>
                        {c.name}
                      </Link>
                      {team.leadUserId === c.id && <Chip>Captain</Chip>}
                      {!c.current && <Chip>Former member</Chip>}
                    </span>
                  </td>
                  <td className="px-3 text-right">{c.activeDays}</td>
                  <td className="px-3 text-right font-semibold">{c.points}</td>
                  <td className="px-4 text-right text-muted">{fmt(c.steps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle title="Recent results" />
          {results.length ? (
            <Card className="divide-y divide-line-2">
              {results.map((f) => {
                const mine = f.home.teamId === team.id ? f.home : f.away;
                const other = f.home.teamId === team.id ? f.away : f.home;
                const r = f.outcome === "draw" ? "D" : f.outcome === team.id ? "W" : "L";
                return (
                  <div key={f.id} className="tnum flex items-center gap-3 px-4 py-2.5 text-sm">
                    <FormGuide form={[r]} />
                    <span className="w-16 text-xs text-muted">Week {f.week.number}</span>
                    <span className="text-muted">v</span>
                    <TeamBadge team={teams.get(other.teamId)!} size="sm" link />
                    <span className="ml-auto font-display text-lg font-bold">
                      {mine.points}–{other.points}
                    </span>
                  </div>
                );
              })}
            </Card>
          ) : (
            <EmptyState title="No results yet" />
          )}
        </section>

        <section>
          <SectionTitle title="Team awards" />
          <Card className="grid grid-cols-2 gap-4 p-5">
            {[
              { icon: Trophy, label: "Monthly Cups", value: cups.length, sub: cups.map((c) => c.label.split(" ")[0]).join(", ") || "None yet" },
              { icon: Flag, label: "Final Sprint", value: s.finalSprint.winners.includes(team.id) ? "Won" : s.finalSprint.status === "completed" ? "–" : "To play", sub: formatRange(s.finalSprint.start, s.finalSprint.end) },
              { icon: Crown, label: "Weekly MVP wins", value: awardCount.mvp, sub: "weeks with a team MVP" },
              { icon: Award, label: "Team Player", value: awardCount.teamPlayer, sub: "weeks as most active team" },
            ].map((x) => (
              <div key={x.label} className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                  <x.icon className="size-3.5" aria-hidden="true" />
                  {x.label}
                </p>
                <p className="tnum font-display text-3xl font-bold">{x.value}</p>
                <p className="truncate text-xs text-muted">{x.sub}</p>
              </div>
            ))}
          </Card>
          {s.champion.includes(team.id) && <p className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-night">Season Champion</p>}
          <p className="mt-3 text-xs text-muted">
            Season total: {compact(row.steps)} steps in completed weeks.
          </p>
        </section>
      </div>
    </>
  );
}
