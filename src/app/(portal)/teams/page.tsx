import type { Metadata } from "next";
import Link from "next/link";
import { Tabs } from "@/components/tabs";
import { TeamIcon } from "@/components/team";
import { PlayerTable, honoursFor, type PlayerRow } from "@/components/player-table";
import { Card, FormGuide, Movement, Notice, PageHeader, fmt } from "@/components/ui";
import type { LeaderRow, MemberStats } from "@/lib/engine/engine";
import type { Member } from "@/lib/engine/types";
import { getPortal } from "@/lib/server/season";

export const metadata: Metadata = { title: "Teams & players" };

// One page for the squads and the individual rankings: the same numbers, either grouped by
// team or as one long list. Picking a sort is what turns it into a leaderboard.
const SORTS = [
  { id: "league", teamsOnly: true, label: "League position", note: "Teams in league order, members by points." },
  { id: "points", teamsOnly: false, label: "Points", note: "Ranked on team points contributed, with steps then the daily average breaking ties." },
  { id: "total", teamsOnly: false, label: "Total steps", note: "Highest cumulative steps this season. Move is the change since last Sunday." },
  { id: "week", teamsOnly: false, label: "This week", note: "Ranked on steps since Monday, with the change against last week's total." },
  { id: "consistency", teamsOnly: false, label: "Consistency", note: "Most days at or above 5,000 steps, and how many were added this week." },
  { id: "improved", teamsOnly: false, label: "Most improved", note: "Latest 7-day average against the first 7-day average. Only days with an entry count (at least 3 in each window)." },
] as const;
type SortId = (typeof SORTS)[number]["id"];
type Metric = Exclude<SortId, "league">;

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

export default async function TeamsPage({ searchParams }: PageProps<"/teams">) {
  const sp = await searchParams;
  const view = sp.view === "players" ? "players" : "teams";
  const asked = SORTS.find((x) => x.id === sp.sort);
  // League position has no meaning once the teams are off screen.
  const sort: SortId = asked && !(asked.teamsOnly && view === "players") ? asked.id : view === "players" ? "points" : "league";
  // The league view ranks teams, not people, so its member lists fall back to the default player order.
  const metric: Metric = sort === "league" ? "points" : sort;
  const ranked = sort !== "league";
  const meta = SORTS.find((x) => x.id === sort)!;

  const { season: s, nameOf } = await getPortal();
  const board: LeaderRow[] = s.leaderboards[metric];
  const rowOf = new Map(board.map((r) => [r.userId, r]));
  const href = (v: string, srt: string) => `/teams?view=${v}&sort=${srt}`;

  const teamById = new Map(s.teams.map((t) => [t.id, t]));

  // Points, steps and the daily average are always on show. A sort that measures something
  // else earns one extra column, named once in the header.
  const EXTRA: Partial<Record<Metric, string>> = { week: "This week", consistency: "5k+ days", improved: "7-day change" };
  const extraLabel = EXTRA[metric];
  const CHANGE: Partial<Record<Metric, string>> = { points: "Move", total: "Move", week: "Move", consistency: "Added" };
  const changeLabel = ranked ? CHANGE[metric] : undefined;

  const extraOf = (st: MemberStats) => {
    switch (metric) {
      case "week":
        return fmt(st.thisWeekSteps);
      case "consistency":
        return String(st.consistencyDays);
      case "improved":
        return st.improvementPct === null ? "–" : `${st.improvementPct >= 0 ? "+" : ""}${st.improvementPct.toFixed(0)}%`;
      default:
        return null;
    }
  };

  // The league view is a roster, not a ranking, so it carries no movement arrows.
  const changeOf = (r: LeaderRow | undefined) => {
    if (!r || !ranked) return null;
    if (metric === "points" || metric === "total") return <Movement value={r.change} />;
    if (metric === "week") return r.change === null ? null : <Movement value={r.change} />;
    if (metric === "consistency") return r.change ? <span className="tnum text-xs font-semibold text-win">+{r.change}</span> : null;
    return null;
  };

  const rowsFor = (members: Member[], showTeam: boolean): PlayerRow[] =>
    members.map((m) => {
      const st = s.stats.get(m.id)!;
      const team = teamById.get(m.teamId!)!;
      const r = rowOf.get(m.id);
      return {
        userId: m.id,
        name: nameOf(m.id),
        color: team.color,
        meta: [team.leadUserId === m.id ? "Captain" : null, showTeam ? team.name : null].filter(Boolean).join(" · "),
        rank: r?.rank ?? null,
        points: st.pointsContributed,
        steps: st.totalSteps,
        avg: st.avgSteps,
        extra: extraOf(st),
        change: changeOf(r),
        honours: honoursFor(s.stepLeaders, m.id),
      };
    });

  // Everyone stays on the list. People the sort cannot place yet sit at the bottom.
  const order = (members: Member[]) =>
    [...members].sort((a, b) => (rowOf.get(a.id)?.rank ?? Infinity) - (rowOf.get(b.id)?.rank ?? Infinity) || a.name.localeCompare(b.name));

  const teamTotal = (teamId: string) => {
    const stats = (s.membersByTeam.get(teamId) ?? []).map((m) => s.stats.get(m.id)!).filter(Boolean);
    switch (metric) {
      case "points": {
        const v = sum(stats.map((x) => x.pointsContributed));
        return { value: v, label: "Team points", text: fmt(v) };
      }
      case "total":
        return { value: sum(stats.map((x) => x.totalSteps)), label: "Team total", text: fmt(sum(stats.map((x) => x.totalSteps))) };
      case "week":
        return { value: sum(stats.map((x) => x.thisWeekSteps)), label: "This week", text: fmt(sum(stats.map((x) => x.thisWeekSteps))) };
      case "consistency": {
        const v = sum(stats.map((x) => x.consistencyDays));
        return { value: v, label: "Active days, all members", text: String(v) };
      }
      case "improved": {
        const vs = stats.map((x) => x.improvementPct).filter((n): n is number => n !== null);
        const v = vs.length ? sum(vs) / vs.length : null;
        return { value: v ?? -Infinity, label: "Average change", text: v === null ? "–" : `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` };
      }
    }
  };

  const teams = sort === "league"
    ? s.standings.map((r) => s.teams.find((t) => t.id === r.teamId)!)
    : [...s.teams].sort((a, b) => teamTotal(b.id).value - teamTotal(a.id).value);
  const everyone = order(s.participants);

  return (
    <>
      <PageHeader eyebrow={`${s.teams.length} teams · ${s.participants.length} walkers`} title="Teams & players">
        Sort the squads and the people by the same measure. Tap any name for their daily steps, streaks and badges.
      </PageHeader>

      <Tabs
        label="View"
        active={view}
        tabs={[
          { id: "teams", label: "By team", href: href("teams", sort) },
          { id: "players", label: "All players", href: href("players", sort) },
        ]}
      />

      <div className="-mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Sort by</span>
          {SORTS.filter((x) => view === "teams" || !x.teamsOnly).map((x) => (
            <Link
              key={x.id}
              href={href(view, x.id)}
              aria-current={x.id === sort ? "true" : undefined}
              className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors ${
                x.id === sort ? "bg-night text-white" : "bg-line-2 text-muted hover:text-ink"
              }`}
            >
              {x.label}
            </Link>
          ))}
        </div>
      </div>
      <p className="mb-4 text-sm text-muted">
        {meta.note} The three number columns stay the same whichever sort you pick.
      </p>

      {metric === "improved" && board.length === 0 && (
        <div className="mb-4">
          <Notice>Most improved starts after two weeks: we need a first week and a later week to compare.</Notice>
        </div>
      )}

      {view === "players" ? (
        <Card className="p-0 sm:p-1">
          <PlayerTable caption="All players" ranked={ranked} extraLabel={extraLabel} changeLabel={changeLabel} rows={rowsFor(everyone, true)} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map((t) => {
            const row = s.standings.find((r) => r.teamId === t.id)!;
            const total = teamTotal(t.id);
            const members = order(s.membersByTeam.get(t.id) ?? []);
            return (
              <Card key={t.id} as="article" className="overflow-hidden">
                <div className="h-1.5" style={{ backgroundColor: t.color }} />
                <div className="flex items-center gap-4 px-4 py-4">
                  <TeamIcon team={t} size="lg" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/teams/${t.slug}`} className="font-display text-2xl font-bold uppercase leading-tight hover:underline">
                      {t.name}
                    </Link>
                    <p className="truncate text-sm text-muted">Captain: {t.leadUserId ? nameOf(t.leadUserId) : "Not chosen yet"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum font-display text-3xl font-bold leading-none">#{row.position}</p>
                    <p className="tnum text-xs text-muted">{row.points} pts</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 border-y border-line-2 bg-line-2/40 px-4 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">{sort === "league" ? "Form" : total.label}</span>
                  {sort === "league" ? <FormGuide form={row.form} /> : <span className="tnum font-display text-lg font-bold leading-none">{total.text}</span>}
                </div>
                {members.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted">No members yet</p>
                ) : (
                  <PlayerTable caption={`${t.name} members`} nameLabel="Member" ranked={ranked} rows={rowsFor(members, false)} />
                )}
                <Link href={`/teams/${t.slug}`} className="block border-t border-line-2 px-4 py-2.5 text-center text-sm font-semibold text-night-3 hover:bg-line-2">
                  Team page →
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
