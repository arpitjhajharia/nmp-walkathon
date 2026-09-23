import { Award, Footprints, Lightbulb, Medal, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { FixtureCard } from "@/components/fixture-card";
import { StandingsTable } from "@/components/standings-table";
import { TeamBadge, TeamIcon } from "@/components/team";
import { Card, Chip, EmptyState, Progress, SectionTitle, fmt, joinNames } from "@/components/ui";
import { diffDays, formatDay, formatRange, formatShort } from "@/lib/engine/dates";
import { BADGES, todayInsight } from "@/lib/engine/engine";
import { getPortal } from "@/lib/server/season";

export default async function HomePage() {
  const { season: s, nameOf } = await getPortal();
  const teams = new Map(s.teams.map((t) => [t.id, t]));
  const week = s.currentWeek;
  const weekFixtures = week ? s.fixtures.filter((f) => f.week.index === week.index) : [];
  const orderedFixtures = weekFixtures;

  // Steps land the morning after, so the freshest day anyone can see is yesterday.
  const latestRecorded = s.participants.filter((m) => {
    const d = s.memberDay(m.id, s.lastCounted);
    return d.leave || d.steps !== null;
  }).length;
  const latestSteps = s.participants.reduce((sum, m) => sum + (s.memberDay(m.id, s.lastCounted).steps ?? 0), 0);
  const scored = s.phase !== "pre" && s.countedDates.length > 0;

  const challenge = week ? s.challenges.find((c) => c.weekIndex === week.index) : undefined;
  const challengeDone = challenge?.progress.filter((p) => p.completed).length ?? 0;

  const lastAwards = s.lastCompletedWeek ? s.weeklyAwards.find((a) => a.weekIndex === s.lastCompletedWeek!.index) : undefined;
  const recentBadges = s.badgeUnlocks.filter((b) => diffDays(b.date, s.today) <= 3 && b.badgeId !== "first_steps").slice(0, 5);

  const sprint = s.finalSprint;
  const sprintLine =
    sprint.status === "upcoming"
      ? `Final Sprint starts in ${diffDays(s.today, sprint.start)} days`
      : sprint.status === "live"
        ? `Final Sprint: ${diffDays(s.today, sprint.end) + 1} days left`
        : "Final Sprint complete";
  const pct = Math.round((s.dayNumber / s.settings.lengthDays) * 100);

  return (
    <div className="space-y-8">
      {/* 1. Competition + days remaining */}
      <section className="relative overflow-hidden rounded-3xl bg-night px-5 py-6 text-white sm:px-8 sm:py-8" aria-labelledby="season-title">
        <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-night-3/60 blur-2xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-accent">
              {s.phase === "live" ? `Week ${week?.number} · ${formatDay(s.today)}` : s.phase === "pre" ? "Coming soon" : "Season complete"}
            </p>
            <h1 id="season-title" className="mt-1 font-display text-4xl font-bold uppercase leading-none sm:text-5xl">
              {s.settings.seasonName}
            </h1>
            <p className="mt-2 text-white/70">
              {formatShort(s.start)} to {formatShort(s.end)} · {sprintLine}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="tnum font-display text-6xl font-bold leading-none text-accent sm:text-7xl">
              {s.phase === "pre" ? diffDays(s.today, s.start) : s.daysRemaining}
            </p>
            <p className="text-sm font-semibold uppercase tracking-wider text-white/70">{s.phase === "pre" ? "days to kick-off" : "days remaining"}</p>
          </div>
        </div>
        {s.phase !== "pre" && (
          <div className="relative mt-6">
            <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Season progress" aria-valuenow={s.dayNumber} aria-valuemin={0} aria-valuemax={s.settings.lengthDays}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <p className="tnum mt-1.5 text-xs text-white/60">
              Day {s.dayNumber} of {s.settings.lengthDays}
              {scored && ` · scored to ${formatDay(s.lastCounted)}`}
            </p>
          </div>
        )}
        {s.champion.length > 0 && (
          <p className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-bold text-night">
            <Medal className="size-4" aria-hidden="true" /> Season Champion: {s.champion.map((id) => teams.get(id)!.name).join(" & ")}
          </p>
        )}
      </section>

      {/* 2. This week's fixtures */}
      <section aria-labelledby="fixtures-h">
        <div id="fixtures-h">
          <SectionTitle
            title={s.phase === "finished" ? "Final week" : "This week's fixtures"}
            sub={week ? `Week ${week.number} · ${formatRange(week.start, week.end)} · Monday to Sunday team points` : undefined}
            action={{ href: "/schedule", label: "Full schedule" }}
          />
        </div>
        {orderedFixtures.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {orderedFixtures.map((f) => (
              <FixtureCard key={f.id} f={f} teams={teams} />
            ))}
          </div>
        ) : (
          <EmptyState title="No fixtures scheduled this week" />
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* 3. League standings */}
        <section className="lg:col-span-7" aria-label="League standings">
          <SectionTitle
            title="League table"
            sub={s.lastCompletedWeek ? `After week ${s.lastCompletedWeek.number}${s.lastCompletedWeek.provisional ? " (provisional until corrections close)" : ""}` : "Fills in after the first week"}
            action={{ href: "/standings", label: "Full table" }}
          />
          <Card className="p-0 sm:p-1">
            <StandingsTable rows={s.standings} teams={teams} />
          </Card>
        </section>

        {/* 4. The latest scored day */}
        <section className="lg:col-span-5" aria-label="Latest day">
          <SectionTitle title="Latest day" sub={scored ? formatDay(s.lastCounted) : undefined} />
          <Card className="p-5">
            {!scored ? (
              <p className="text-sm text-muted">
                {s.phase === "pre" ? "The first steps are scored the morning after day one." : s.phase === "finished" ? "The season has finished." : "Day one is scored tomorrow morning."}
              </p>
            ) : (
              <>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Walkers in</p>
                    <p className="tnum font-display text-4xl font-bold leading-none">
                      {latestRecorded}
                      <span className="text-2xl text-muted">/{s.participants.length}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Steps recorded</p>
                    <p className="tnum font-display text-4xl font-bold leading-none">{fmt(latestSteps)}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <Progress value={latestRecorded} max={s.participants.length} label="Walkers with steps on the latest day" />
                </div>
                {latestRecorded === 0 ? (
                  <p className="mt-4 rounded-xl bg-line-2 px-3 py-3 text-sm font-medium text-ink-2">Nothing for this day in the sheet yet.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {s.teams.map((t) => {
                      const td = s.teamDay(t.id, s.lastCounted);
                      const label = td.status === "complete" ? "Complete" : td.status === "partial" ? `${td.recorded} of ${td.members}` : "Not entered";
                      return (
                        <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                          <TeamBadge team={t} size="sm" />
                          <span className="flex items-center gap-2">
                            <span className="tnum font-semibold">
                              {td.earned}/{td.possible} pts
                            </span>
                            <Chip tone={td.status === "complete" ? "good" : td.status === "partial" ? "warn" : "neutral"}>{label}</Chip>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </Card>
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* 5. Weekly challenge */}
        <section aria-label="Weekly challenge">
          <SectionTitle title="Weekly challenge" sub="Optional, just for fun. It never changes league points." />
          {challenge ? (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Target className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-2xl font-bold uppercase leading-tight">{challenge.title}</p>
                  <p className="text-sm text-muted">{challenge.description}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted">
                <span className="tnum font-semibold text-ink">{challengeDone}</span> of {challenge.progress.length} people have completed it this week.
              </p>
            </Card>
          ) : (
            <EmptyState title="No challenge this week" icon={<Target className="size-6" />}>
              Your admin can set one from the admin area.
            </EmptyState>
          )}
        </section>

        {/* 6. Latest awards & badges */}
        <section aria-label="Latest awards and badges">
          <SectionTitle title="Latest awards" sub={s.lastCompletedWeek ? `Week ${s.lastCompletedWeek.number}` : undefined} action={{ href: "/awards", label: "All awards" }} />
          <Card className="divide-y divide-line-2">
            {lastAwards ? (
              (
                [
                  ["Weekly MVP", lastAwards.mvp],
                  ["Consistency Star", lastAwards.consistency],
                  ["Comeback Walker", lastAwards.comeback],
                  ["Team Player", lastAwards.teamPlayer],
                ] as const
              ).map(([label, winners]) => (
                <div key={label} className="flex items-start gap-3 px-5 py-3">
                  <Award className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
                    <p className="text-sm font-semibold text-ink">{winners.length ? joinNames(winners.map((w) => nameOf(w.userId).split(" ")[0])) : "Not awarded"}</p>
                    {winners[0] && <p className="text-xs text-muted">{winners[0].detail}</p>}
                  </div>
                </div>
              ))
            ) : (
              <p className="px-5 py-4 text-sm text-muted">Awards are announced after the first Sunday.</p>
            )}
            {recentBadges.length > 0 && (
              <div className="px-5 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">New badges</p>
                <ul className="flex flex-wrap gap-2">
                  {recentBadges.map((b) => {
                    const team = teams.get(s.stats.get(b.userId)?.teamId ?? "");
                    return (
                      <li key={`${b.userId}-${b.badgeId}`} className="inline-flex items-center gap-1.5 rounded-full bg-line-2 py-1 pl-1 pr-2.5 text-xs font-semibold">
                        {team && <TeamIcon team={team} size="sm" />}
                        {nameOf(b.userId).split(" ")[0]} · {BADGES.find((x) => x.id === b.badgeId)?.name}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* 7. What matters today */}
      <section aria-label="What matters today" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">What matters today</p>
          <p className="text-[15px] font-medium text-amber-950">{todayInsight(s)}</p>
        </div>
      </section>

      <p className="flex items-center justify-center gap-2 text-xs text-muted">
        <Footprints className="size-3.5" aria-hidden="true" /> Walking regularly counts for more than big totals. <Link href="/rules" className="font-semibold underline">How scoring works</Link>
        <Sparkles className="size-3.5" aria-hidden="true" />
      </p>
    </div>
  );
}
