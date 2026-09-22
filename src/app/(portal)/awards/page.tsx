import { Award, Crown, Flag, Medal, Star, TrendingUp, Trophy, Users, type LucideIcon } from "lucide-react";
import { BADGE_ICONS } from "@/components/badges";
import type { Metadata } from "next";
import { TeamBadge, TeamIcon } from "@/components/team";
import { Card, Chip, EmptyState, PageHeader, Progress, SectionTitle, joinNames } from "@/components/ui";
import { formatRange } from "@/lib/engine/dates";
import { BADGES, type AwardWinner, type WeeklyAwards } from "@/lib/engine/engine";
import { getPortal } from "@/lib/server/season";

export const metadata: Metadata = { title: "Awards" };

const AWARDS: { key: keyof Omit<WeeklyAwards, "weekIndex" | "final">; label: string; how: string; icon: LucideIcon }[] = [
  { key: "mvp", label: "Weekly MVP", how: "Most steps this week", icon: Crown },
  { key: "consistency", label: "Consistency Star", how: "Most 5k+ days this week", icon: Star },
  { key: "comeback", label: "Comeback Walker", how: "Biggest rise in daily average vs last week", icon: TrendingUp },
  { key: "teamPlayer", label: "Team Player", how: "Top contributor in the most active team", icon: Users },
];


export default async function AwardsPage() {
  const { season: s, nameOf } = await getPortal();
  const teams = new Map(s.teams.map((t) => [t.id, t]));
  const final = s.weeklyAwards.filter((a) => a.final);
  const latest = final[final.length - 1];
  const liveAwards = s.weeklyAwards.find((a) => !a.final);
  const challenge = s.currentWeek ? s.challenges.find((c) => c.weekIndex === s.currentWeek!.index) : undefined;

  const Winners = ({ ws }: { ws: AwardWinner[] }) =>
    ws.length === 0 ? (
      <p className="text-sm text-muted">Not awarded</p>
    ) : (
      <ul className="space-y-1">
        {ws.map((w) => {
          const team = teams.get(s.stats.get(w.userId)?.teamId ?? "");
          return (
            <li key={w.userId} className="flex items-center gap-2">
              {team && <TeamIcon team={team} size="sm" />}
              <span className="font-semibold">{nameOf(w.userId)}</span>
            </li>
          );
        })}
      </ul>
    );

  return (
    <>
      <PageHeader eyebrow="Recognition" title="Awards">
        Awards are decided automatically every Sunday. Ties mean joint winners. Badges are for display and never change points.
      </PageHeader>

      {s.phase === "finished" && (
        <section className="mb-10">
          <SectionTitle title="Season awards" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Season Champion", teams: s.champion },
              { label: "Final Sprint", teams: s.finalSprint.winners },
            ].map((x) => (
              <Card key={x.label} className="bg-night p-5 text-white">
                <Trophy className="size-6 text-accent" aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-white/60">{x.label}</p>
                <p className="font-display text-2xl font-bold uppercase">{x.teams.map((id) => teams.get(id)!.name).join(" & ") || "–"}</p>
              </Card>
            ))}
            {[
              { label: "Most steps", row: s.leaderboards.total[0], fmt: (v: number) => `${v.toLocaleString("en-US")} steps` },
              { label: "Most consistent", row: s.leaderboards.consistency[0], fmt: (v: number) => `${v} days at 5k+` },
            ].map((x) => (
              <Card key={x.label} className="p-5">
                <Medal className="size-6 text-accent-ink" aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted">{x.label}</p>
                <p className="font-display text-2xl font-bold uppercase">{x.row ? nameOf(x.row.userId) : "–"}</p>
                {x.row && <p className="text-xs text-muted">{x.fmt(x.row.value)}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <SectionTitle title={latest ? `Week ${latest.weekIndex + 1} winners` : "This week's awards"} sub={latest ? formatRange(s.weeks[latest.weekIndex].start, s.weeks[latest.weekIndex].end) : undefined} />
        {latest ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {AWARDS.map((a) => (
              <Card key={a.key} className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex size-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <a.icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-display text-lg font-bold uppercase leading-tight">{a.label}</p>
                    <p className="text-xs text-muted">{a.how}</p>
                  </div>
                </div>
                <Winners ws={latest[a.key]} />
                {latest[a.key][0] && <p className="mt-2 text-xs text-muted">{latest[a.key][0].detail}</p>}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="The first awards arrive after Sunday" icon={<Award className="size-6" />} />
        )}
        {liveAwards && (
          <p className="mt-3 text-sm text-muted">
            <span className="font-semibold text-ink">Race so far this week:</span> MVP {joinNames(liveAwards.mvp.map((w) => nameOf(w.userId)))} leads with {liveAwards.mvp[0]?.detail ?? "no steps yet"}.
          </p>
        )}
      </section>

      {challenge && (
        <section className="mb-10">
          <SectionTitle title="Weekly challenge" sub="Optional and just for fun. It never changes league points." />
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-bold uppercase">{challenge.title}</p>
                <p className="text-sm text-muted">{challenge.description}</p>
              </div>
              <Chip tone="good">
                {challenge.progress.filter((p) => p.completed).length} of {challenge.progress.length} complete
              </Chip>
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {s.teams.map((t) => {
                const ids = new Set((s.membersByTeam.get(t.id) ?? []).map((m) => m.id));
                const done = challenge.progress.filter((p) => ids.has(p.userId) && p.completed).length;
                return (
                  <li key={t.id} className="rounded-xl bg-line-2 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <TeamBadge team={t} size="sm" />
                      <span className="tnum text-sm font-semibold">
                        {done}/{ids.size}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      <section className="mb-10">
        <SectionTitle title="Badges" sub="Personal milestones. Open anyone's page from Players to see their progress." />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {BADGES.map((b) => {
            const Icon = BADGE_ICONS[b.id] ?? Award;
            const holders = [...s.stats.values()].filter((st) => st.badges.find((x) => x.id === b.id)?.unlockedOn);
            return (
              <Card key={b.id} className="p-4">
                <span className={`inline-flex size-10 items-center justify-center rounded-full ${holders.length ? "bg-accent text-night" : "bg-line-2 text-muted"}`}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-2 font-semibold">{b.name}</p>
                <p className="text-xs text-muted">{b.description}</p>
                <p className="tnum mt-2 text-xs text-muted">
                  {holders.length} {holders.length === 1 ? "person has" : "people have"} it
                </p>
                {holders.length > 0 && holders.length <= 4 && <p className="mt-1 text-xs font-semibold text-ink-2">{holders.map((h) => nameOf(h.userId).split(" ")[0]).join(", ")}</p>}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle title="Monthly Cups & Final Sprint" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...s.monthlyCups.map((c) => ({ ...c, label: `${c.label} Cup`, icon: Trophy })), { ...s.finalSprint, icon: Flag }].map((c) => (
            <Card key={c.key} className="p-4">
              <p className="flex items-center gap-1.5 font-display text-lg font-bold uppercase">
                <c.icon className="size-4 text-accent-ink" aria-hidden="true" />
                {c.label}
              </p>
              <p className="text-xs text-muted">{formatRange(c.start, c.end)}</p>
              <div className="mt-2 text-sm">
                {c.status === "completed" ? (
                  c.winners.length ? c.winners.map((id) => <TeamBadge key={id} team={teams.get(id)!} size="sm" className="mr-2" />) : "No winner"
                ) : c.status === "live" ? (
                  <span className="text-muted">
                    In progress: <span className="font-semibold text-ink">{teams.get(c.totals[0].teamId)!.name}</span> lead with {c.totals[0].points} pts
                  </span>
                ) : (
                  <span className="text-muted">Not started</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="Previous weekly winners" />
        {final.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Weekly award winners by week</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-4 py-2.5">Week</th>
                  {AWARDS.map((a) => (
                    <th key={a.key} scope="col" className="px-3 py-2.5">{a.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...final].reverse().map((w) => (
                  <tr key={w.weekIndex} className="border-b border-line-2 align-top last:border-0">
                    <th scope="row" className="px-4 py-2.5 text-left font-display text-base font-bold">{w.weekIndex + 1}</th>
                    {AWARDS.map((a) => (
                      <td key={a.key} className="px-3 py-2.5">
                        {w[a.key].length ? joinNames(w[a.key].map((x) => nameOf(x.userId)), 2) : <span className="text-muted">–</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </>
  );
}
