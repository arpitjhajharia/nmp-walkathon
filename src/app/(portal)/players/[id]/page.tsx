import { Award, Flame, Target } from "lucide-react";
import type { Metadata } from "next";
import { BADGE_ICONS } from "@/components/badges";
import { TeamBadge } from "@/components/team";
import { Card, Chip, EmptyState, PageHeader, Pips, Progress, SectionTitle, Stat, fmt } from "@/components/ui";
import { formatDay, formatShort } from "@/lib/engine/dates";
import { BADGES, nextBand, sortedBands } from "@/lib/engine/engine";
import { notFound } from "next/navigation";
import { getPortal } from "@/lib/server/season";

const SHADES = ["#c3cad5", "#8aa2c8", "#4b6a9b", "#213a63", "#0d1b2e"];

export async function generateMetadata({ params }: PageProps<"/players/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: (await getPortal()).users.get(id)?.name ?? "Player" };
}

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const { season: s, users } = await getPortal();
  const person = users.get(id);
  if (!person) notFound();
  const st = s.stats.get(id);
  const team = s.teams.find((t) => t.id === person.teamId);

  if (!st || !team) {
    return (
      <>
        <PageHeader eyebrow="Player" title={person.name} />
        <EmptyState title="Not on a team this season" />
      </>
    );
  }

  const bands = sortedBands(s.settings.bands);
  const latest = st.latest;
  const nb = latest.steps !== null ? nextBand(latest.steps, bands) : null;
  const days = s.countedDates.slice(-30);
  const values = days.map((d) => s.memberDay(id, d));
  const top = Math.max(14000, ...values.map((v) => v.steps ?? 0));
  const W = 600,
    H = 180,
    barW = W / Math.max(days.length, 1);
  const y = (v: number) => H - (Math.min(v, top) / top) * H;
  // One shade per band, darkest at the top, so the ramp follows the band table however it
  // is configured rather than assuming a particular number of points.
  const shadeFor = (points: number) => {
    const i = bands.findIndex((b) => b.points === points);
    if (i < 0) return SHADES[0];
    return SHADES[Math.round((i / Math.max(1, bands.length - 1)) * (SHADES.length - 1))];
  };
  const challenge = s.currentWeek ? s.challenges.find((c) => c.weekIndex === s.currentWeek!.index) : undefined;
  const myChallenge = challenge?.progress.find((p) => p.userId === id);
  const earned = st.badges.filter((b) => b.unlockedOn);
  const locked = st.badges.filter((b) => !b.unlockedOn);

  return (
    <>
      <PageHeader eyebrow="Player" title={person.name}>
        <TeamBadge team={team} size="sm" link />
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-night p-5 text-white lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Latest day · {formatDay(s.lastCounted)}</p>
          {s.countedDates.length === 0 ? (
            <p className="mt-2 text-white/80">The first day is scored tomorrow morning.</p>
          ) : latest.leave ? (
            <p className="mt-2 font-display text-3xl font-bold uppercase">On leave</p>
          ) : latest.steps === null ? (
            <p className="mt-2 text-white/80">Not in the sheet yet.</p>
          ) : (
            <>
              <p className="tnum mt-1 font-display text-5xl font-bold">{fmt(latest.steps)}</p>
              <div className="mt-1 flex items-center gap-2">
                <Pips points={latest.points} max={s.maxDaily} dark />
                <span className="text-sm text-white/80">
                  {latest.points} team point{latest.points === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-3 text-sm text-accent">
                {nb ? `${fmt(nb.gap)} more steps would have earned ${nb.points - latest.points} extra point${nb.points - latest.points === 1 ? "" : "s"}.` : `Top band reached: full points for ${team.name}.`}
              </p>
            </>
          )}
        </Card>
        <Card className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:col-span-2">
          <Stat label="Total steps" value={fmt(st.totalSteps)} />
          <Stat label="5k+ days" value={st.consistencyDays} sub={`of ${st.daysRecorded} recorded`} />
          <Stat label="Points for team" value={st.pointsContributed} />
          <Stat
            label="Current streak"
            value={
              <span className="inline-flex items-center gap-1">
                {st.currentStreak}
                {st.currentStreak >= 3 && <Flame className="size-6 text-orange-600" aria-hidden="true" />}
              </span>
            }
            sub={`Best ${st.bestStreak}`}
          />
          <Stat label="This week" value={fmt(st.thisWeekSteps)} sub={`Last week ${fmt(st.lastWeekSteps)}`} />
          <Stat
            label="Improvement"
            value={st.improvementPct === null ? "–" : `${st.improvementPct >= 0 ? "+" : ""}${st.improvementPct.toFixed(0)}%`}
            sub={st.first7Avg && st.latest7Avg ? `${fmt(st.first7Avg)} → ${fmt(st.latest7Avg)} a day` : "Available after two weeks"}
          />
        </Card>
      </div>

      <section className="mt-10">
        <SectionTitle title="Last 30 days" sub="Dashed lines mark the point bands." />
        <Card className="p-4 sm:p-5">
          {days.length === 0 ? (
            <p className="text-sm text-muted">The chart appears once the season starts.</p>
          ) : (
            <>
              <svg viewBox={`0 0 ${W + 44} ${H + 22}`} className="h-auto w-full" role="img" aria-label={`Daily steps for the last ${days.length} days`}>
                {bands
                  .filter((b) => b.min > 0 && b.min <= top)
                  .map((b) => (
                    <g key={b.min}>
                      <line x1={0} x2={W} y1={y(b.min)} y2={y(b.min)} stroke="#c3cad5" strokeDasharray="4 4" />
                      <text x={W + 4} y={y(b.min) + 4} fontSize="11" fill="#586275">
                        {b.min / 1000}k
                      </text>
                    </g>
                  ))}
                {values.map((v, i) => {
                  const h = v.steps ? H - y(v.steps) : 0;
                  const fill = shadeFor(v.points);
                  return (
                    <g key={days[i]}>
                      <title>{`${formatShort(days[i])}: ${v.leave ? "on leave" : v.steps === null ? "no entry" : `${fmt(v.steps)} steps, ${v.points} pts`}`}</title>
                      {v.leave ? (
                        <rect x={i * barW + barW * 0.15} y={H - 6} width={barW * 0.7} height={6} rx={2} fill="#f5b82e" />
                      ) : (
                        <rect x={i * barW + barW * 0.15} y={H - h} width={barW * 0.7} height={Math.max(h, v.steps === null ? 0 : 2)} rx={2} fill={fill} />
                      )}
                    </g>
                  );
                })}
                <text x={0} y={H + 16} fontSize="11" fill="#586275">{formatShort(days[0])}</text>
                <text x={W} y={H + 16} fontSize="11" fill="#586275" textAnchor="end">{formatShort(days[days.length - 1])}</text>
              </svg>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#0d1b2e]" aria-hidden="true" /> Darker bars mean more points</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#c3cad5]" aria-hidden="true" /> Under 5,000</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent" aria-hidden="true" /> On leave</span>
              </p>
            </>
          )}
        </Card>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle title="Weekly challenge" />
          {challenge && myChallenge ? (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <Target className="mt-1 size-5 text-amber-700" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-display text-xl font-bold uppercase">{challenge.title}</p>
                  <p className="text-sm text-muted">{challenge.description}</p>
                  <div className="mt-3">
                    <Progress value={myChallenge.current} max={myChallenge.target} color={myChallenge.completed ? "#15803d" : "#0d1b2e"} label="Challenge progress" />
                    <p className="tnum mt-1 text-sm font-semibold">{myChallenge.completed ? "Completed. Nice work." : `${myChallenge.current} of ${myChallenge.target}`}</p>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <EmptyState title="No challenge this week" />
          )}
        </section>

        <section>
          <SectionTitle title="Badges" sub={`${earned.length} of ${BADGES.length} earned`} />
          <Card className="p-5">
            {earned.length > 0 && (
              <ul className="mb-4 flex flex-wrap gap-2">
                {earned.map((b) => {
                  const def = BADGES.find((x) => x.id === b.id)!;
                  const Icon = BADGE_ICONS[b.id] ?? Award;
                  return (
                    <li key={b.id}>
                      <Chip tone="good">
                        <Icon className="size-3.5" aria-hidden="true" /> {def.name} · {formatShort(b.unlockedOn!)}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            )}
            <ul className="space-y-3">
              {locked.map((b) => {
                const def = BADGES.find((x) => x.id === b.id)!;
                return (
                  <li key={b.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-semibold">{def.name}</span>
                      <span className="tnum text-muted">
                        {b.progress.toLocaleString("en-US")} / {b.target.toLocaleString("en-US")}
                      </span>
                    </div>
                    <Progress value={b.progress} max={b.target} label={`${def.name} progress`} />
                  </li>
                );
              })}
              {locked.length === 0 && <li className="text-sm font-semibold text-win">Every badge collected.</li>}
            </ul>
          </Card>
        </section>
      </div>
    </>
  );
}
