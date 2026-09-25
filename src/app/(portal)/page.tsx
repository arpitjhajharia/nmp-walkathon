import { Award, Crown, Footprints, Lightbulb, Medal, Target } from "lucide-react";
import Link from "next/link";
import { FixtureCard } from "@/components/fixture-card";
import { CountUp } from "@/components/motion";
import { StandingsTable } from "@/components/standings-table";
import { TeamBadge, TeamIcon } from "@/components/team";
import { PlayerTable, honoursFor } from "@/components/player-table";
import { Card, Chip, EmptyState, Movement, Progress, SectionTitle, compact, fmt, joinNames } from "@/components/ui";
import { diffDays, formatDay, formatRange, formatShort } from "@/lib/engine/dates";
import { BADGES, todayInsight } from "@/lib/engine/engine";
import { getPortal } from "@/lib/server/season";

export default async function HomePage() {
  const { season: s, nameOf } = await getPortal();
  const teams = new Map(s.teams.map((t) => [t.id, t]));
  const week = s.currentWeek;
  const weekFixtures = week ? s.fixtures.filter((f) => f.week.index === week.index) : [];

  // Steps land the morning after, so the freshest day anyone can see is yesterday.
  const latestRecorded = s.participants.filter((m) => {
    const d = s.memberDay(m.id, s.lastCounted);
    return d.leave || d.steps !== null;
  }).length;
  const latestSteps = s.participants.reduce((sum, m) => sum + (s.memberDay(m.id, s.lastCounted).steps ?? 0), 0);
  const scored = s.phase !== "pre" && s.countedDates.length > 0;

  // The running order. Unlike the league table this counts the week in progress, so it
  // moves every morning. Teams level on points are split by steps, then share a position.
  const sorted = s.teams
    .map((t) => ({
      team: t,
      points: s.countedDates.reduce((sum, d) => sum + s.teamDay(t.id, d).earned, 0),
      steps: s.countedDates.reduce((sum, d) => sum + s.teamDay(t.id, d).steps, 0),
    }))
    .sort((a, b) => b.points - a.points || b.steps - a.steps);
  let place = 0;
  const ranking = sorted.map((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.points !== r.points || prev.steps !== r.steps) place = i + 1;
    return { ...r, position: place };
  });
  const leadPoints = ranking[0]?.points ?? 0;

  const topWalkers = s.leaderboards.points.slice(0, 8);

  const challenge = week ? s.challenges.find((c) => c.weekIndex === week.index) : undefined;
  const challengeDone = challenge?.progress.filter((p) => p.completed).length ?? 0;

  const lastAwards = s.lastCompletedWeek ? s.weeklyAwards.find((a) => a.weekIndex === s.lastCompletedWeek!.index) : undefined;
  const recentBadges = s.badgeUnlocks.filter((b) => diffDays(b.date, s.today) <= 3 && b.badgeId !== "first_steps").slice(0, 5);

  const lastWeek = s.lastCompletedWeek;
  const sprint = s.finalSprint;
  const pct = Math.round((s.dayNumber / s.settings.lengthDays) * 100);

  // Each chip carries its own label, so nothing has to be joined into a run-on string.
  const metrics: string[] =
    s.phase === "pre"
      ? [`Kick-off ${formatShort(s.start)}`, `${fmt(diffDays(s.today, s.start))} days to go`, `${s.teams.length} teams`]
      : [
          `Day ${fmt(s.dayNumber)} of ${s.settings.lengthDays}`,
          `${fmt(s.daysRemaining)} days left`,
          sprint.status === "upcoming"
            ? `Final Sprint in ${diffDays(s.today, sprint.start)} days`
            : sprint.status === "live"
              ? `Final Sprint: ${diffDays(s.today, sprint.end) + 1} days left`
              : "Final Sprint complete",
        ];

  return (
    <div className="space-y-10">
      {/* The page-load moment: the band arrives, then the four teams land in order, their
          bars grow to today's totals and the points tally up. One sequence, then the page
          settles. Everything below reveals once, quietly, as you reach it. */}
      <section className="enter overflow-hidden rounded-2xl bg-night px-5 py-4 text-white sm:px-6 sm:py-5" aria-labelledby="season-title">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 id="season-title" className="font-display text-2xl font-bold uppercase leading-none tracking-tight sm:text-4xl">
              {s.settings.seasonName}
            </h1>
            <p className="mt-1.5 text-sm text-white/65">
              {s.phase === "live" ? `Week ${week?.number} · ${formatDay(s.today)}` : s.phase === "pre" ? `Starts ${formatShort(s.start)}` : "Season complete"}
            </p>
          </div>
          <ul className="flex flex-wrap items-center gap-2">
            {metrics.map((m) => (
              <li key={m} className="tnum rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
                {m}
              </li>
            ))}
          </ul>
        </div>

        {s.phase !== "pre" && (
          <div
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-label="Season progress"
            aria-valuenow={s.dayNumber}
            aria-valuemin={0}
            aria-valuemax={s.settings.lengthDays}
          >
            <div className="bar-fill h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        )}

        {scored && (
          <p className="mt-4 flex items-start gap-2.5 text-[15px] font-medium leading-snug text-white">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>{todayInsight(s)}</span>
          </p>
        )}

        {s.champion.length > 0 && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-bold text-night">
            <Medal className="size-4" aria-hidden="true" /> Season Champion: {s.champion.map((id) => teams.get(id)!.name).join(" & ")}
          </p>
        )}
      </section>

      {/* 1. Season rankings */}
      <section aria-labelledby="ranking-h">
        <div id="ranking-h">
          <SectionTitle
            title="Season rankings"
            sub={scored ? `Every point scored so far, including the week in progress. Scored to ${formatDay(s.lastCounted)}.` : "Every point scored so far, including the week in progress."}
            action={{ href: "/teams", label: "Teams & players" }}
          />
        </div>
        {!scored ? (
          <EmptyState title="Nothing scored yet">{s.phase === "pre" ? "The first steps are scored the morning after day one." : "Day one is scored tomorrow morning."}</EmptyState>
        ) : (
          <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {ranking.map((r, i) => (
              <li key={r.team.id} className="enter" style={{ "--step": i + 1 } as React.CSSProperties}>
                <Card as="article" className={`h-full overflow-hidden ${r.position === 1 ? "ring-2 ring-accent" : ""}`}>
                  <div className="h-1.5" style={{ backgroundColor: r.team.color }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="tnum font-display text-3xl font-bold leading-none text-ink-2">{r.position}</span>
                        <TeamBadge team={r.team} size="sm" link className="min-w-0" />
                      </div>
                      {r.position === 1 && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-1.5 py-1 text-[11px] font-bold text-night sm:px-2.5 sm:py-0.5">
                          <Crown className="size-3.5" aria-hidden="true" />
                          <span className="sr-only sm:not-sr-only">Leader</span>
                        </span>
                      )}
                    </div>
                    <p className="tnum mt-3 font-display text-4xl font-bold leading-none">{fmt(r.points)}</p>
                    <p className="mt-1 text-xs text-muted">team points · {compact(r.steps)} steps</p>
                    <div className="mt-3">
                      <Progress value={r.points} max={leadPoints || 1} color={r.team.color} label={`${r.team.name}: ${r.points} team points`} />
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 2. This week's fixtures */}
      <section className="reveal" aria-labelledby="fixtures-h">
        <div id="fixtures-h">
          <SectionTitle
            title={s.phase === "finished" ? "Final week" : "This week's fixtures"}
            sub={week ? `Week ${week.number} · ${formatRange(week.start, week.end)}. Monday to Sunday team points.` : undefined}
            action={{ href: "/schedule", label: "Full schedule" }}
          />
        </div>
        {weekFixtures.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {weekFixtures.map((f) => (
              <FixtureCard key={f.id} f={f} teams={teams} />
            ))}
          </div>
        ) : (
          <EmptyState title="No fixtures scheduled this week" />
        )}
      </section>

      {/* 3. League standings */}
      <section className="reveal" aria-label="League standings">
        <SectionTitle title="League table" sub={lastWeek ? `After week ${lastWeek.number} · ${formatRange(lastWeek.start, lastWeek.end)}` : "Fills in after the first week"} />
        {lastWeek?.provisional && (
          <p className="mb-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink-2">
            <span className="font-semibold text-ink">Provisional.</span> Week {lastWeek.number} results can still change until corrections close tonight.
          </p>
        )}
        <Card className="p-0 sm:p-2">
          <StandingsTable rows={s.standings} teams={teams} />
        </Card>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">
          <div><dt className="inline font-semibold text-ink-2">Ranking order: </dt><dd className="inline">league points, then fixtures won, then total activity points, then total steps.</dd></div>
          <div><dt className="inline font-semibold text-ink-2">Form: </dt><dd className="inline">last five results, oldest first (W win, D draw, L loss).</dd></div>
          <div><dt className="inline font-semibold text-ink-2">Activity pts: </dt><dd className="inline">all daily team points earned in completed weeks. The season rankings above count this week too.</dd></div>
          <div><dt className="inline font-semibold text-ink-2">Move: </dt><dd className="inline">change in position since the previous completed week.</dd></div>
        </dl>
      </section>

      {/* 4. Player performance */}
      <section className="reveal" aria-labelledby="players-h">
        <div id="players-h">
          <SectionTitle title="Player performance" sub="Steps and points for the people behind the teams." action={{ href: "/teams?view=players", label: "All players" }} />
        </div>
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h3 className="mb-2 font-display text-lg font-bold text-ink-2">Top walkers</h3>
            {!scored ? (
              <EmptyState title="No steps in yet" icon={<Footprints className="size-6" />} />
            ) : (
              <Card as="div" className="p-0 sm:p-1">
                <PlayerTable
                  caption="Top walkers by team points"
                  ranked
                  changeLabel="Move"
                  rows={topWalkers.map((r) => {
                    const st = s.stats.get(r.userId)!;
                    const team = teams.get(st.teamId);
                    return {
                      userId: r.userId,
                      name: nameOf(r.userId),
                      color: team?.color,
                      meta: [team?.name, st.currentStreak >= 3 ? `${st.currentStreak}-day streak` : null].filter(Boolean).join(" · "),
                      rank: r.rank,
                      points: st.pointsContributed,
                      steps: st.totalSteps,
                      avg: st.avgSteps,
                      change: r.change === null ? null : <Movement value={r.change} />,
                      honours: honoursFor(s.stepLeaders, r.userId),
                    };
                  })}
                />
                <p className="border-t border-line-2 px-4 py-2.5 text-xs text-muted">
                  Ranked by team points, then steps, then the daily average. Pts are what each person contributed to their team, and the average counts only days with an entry.
                  {lastWeek && " Move shows the change since last Sunday."}
                </p>
              </Card>
            )}
          </div>

          <div className="lg:col-span-5">
            <h3 className="mb-2 flex items-end justify-between gap-3 font-display text-lg font-bold text-ink-2">
              Awards &amp; badges
              <Link href="/awards" className="pb-0.5 text-xs font-semibold text-night-3 hover:underline">
                All awards →
              </Link>
            </h3>
            <Card as="div" className="divide-y divide-line-2">
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
                      <p className="text-xs font-semibold text-muted">{label}</p>
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
                  <p className="mb-2 text-xs font-semibold text-muted">New badges</p>
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
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* 5. The latest scored day */}
        <section className="reveal" aria-label="Latest day">
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
                    <p className="tnum font-display text-4xl font-bold leading-none">
                      <CountUp value={latestSteps} />
                    </p>
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

        {/* 6. Weekly challenge */}
        <section className="reveal" aria-label="Weekly challenge">
          <SectionTitle title="Weekly challenge" sub="Optional, just for fun. It never changes league points." />
          {challenge ? (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-night/8 text-night-3">
                  <Target className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-2xl font-bold leading-tight">{challenge.title}</p>
                  <p className="text-sm text-muted">{challenge.description}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted">
                <span className="tnum font-semibold text-ink">{challengeDone}</span> of {challenge.progress.length} people have completed it this week.
              </p>
              <div className="mt-2">
                <Progress value={challengeDone} max={challenge.progress.length || 1} label="People who have completed this week's challenge" />
              </div>
            </Card>
          ) : (
            <EmptyState title="No challenge this week" icon={<Target className="size-6" />}>
              Your admin can set one from the admin area.
            </EmptyState>
          )}
        </section>
      </div>

      <p className="flex items-center justify-center gap-2 text-xs text-muted">
        <Footprints className="size-3.5" aria-hidden="true" /> Walking regularly counts for more than big totals.{" "}
        <Link href="/rules" className="font-semibold underline">
          How scoring works
        </Link>
      </p>
    </div>
  );
}
