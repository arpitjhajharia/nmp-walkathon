import type { Metadata } from "next";
import Link from "next/link";
import { Tabs } from "@/components/tabs";
import { TeamIcon } from "@/components/team";
import { Avatar, Card, FormGuide, Movement, Notice, PageHeader, fmt } from "@/components/ui";
import type { LeaderRow } from "@/lib/engine/engine";
import type { Member, Team } from "@/lib/engine/types";
import { getPortal } from "@/lib/server/season";

export const metadata: Metadata = { title: "Teams & players" };

// One page for the squads and the individual rankings: the same numbers, either grouped by
// team or as one long list. Picking a sort is what turns it into a leaderboard.
const SORTS = [
  { id: "league", teamsOnly: true, label: "League position", note: "Teams in league order. Members are listed alphabetically with their season steps." },
  { id: "total", teamsOnly: false, label: "Total steps", note: "Highest cumulative steps this season. Arrows show movement since last Sunday." },
  { id: "week", teamsOnly: false, label: "This week", note: "Steps since Monday. The small number is the change against last week's total." },
  { id: "consistency", teamsOnly: false, label: "Consistency", note: "Most days at or above 5,000 steps. The small number shows days added this week." },
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
  const sort: SortId = asked && !(asked.teamsOnly && view === "players") ? asked.id : view === "players" ? "total" : "league";
  const metric: Metric = sort === "league" ? "total" : sort;
  const ranked = sort !== "league";
  const meta = SORTS.find((x) => x.id === sort)!;

  const { season: s, nameOf } = await getPortal();
  const board: LeaderRow[] = s.leaderboards[metric];
  const rowOf = new Map(board.map((r) => [r.userId, r]));
  const href = (v: string, srt: string) => `/teams?view=${v}&sort=${srt}`;

  const valueOf = (userId: string) => {
    const st = s.stats.get(userId)!;
    switch (metric) {
      case "total":
        return { main: fmt(st.totalSteps), unit: "steps" };
      case "week":
        return { main: fmt(st.thisWeekSteps), unit: "steps" };
      case "consistency":
        return { main: String(st.consistencyDays), unit: st.consistencyDays === 1 ? "day" : "days" };
      case "improved":
        return st.improvementPct === null
          ? { main: "–", unit: "not enough days yet" }
          : { main: `${st.improvementPct >= 0 ? "+" : ""}${st.improvementPct.toFixed(0)}%`, unit: `${fmt(st.first7Avg ?? 0)} → ${fmt(st.latest7Avg ?? 0)} a day` };
    }
  };

  // The league view is a roster, not a ranking, so it carries no movement arrows.
  const changeOf = (r: LeaderRow | undefined) => {
    if (!r || !ranked) return null;
    if (metric === "total") return <Movement value={r.change} />;
    if (metric === "week") return r.change === null ? null : <Movement value={r.change} />;
    if (metric === "consistency") return r.change ? <span className="tnum text-xs font-semibold text-win">+{r.change} this week</span> : null;
    return null;
  };

  // Everyone stays on the list. People the sort cannot place yet sit at the bottom.
  const byMetric = (a: Member, b: Member) =>
    (rowOf.get(a.id)?.rank ?? Infinity) - (rowOf.get(b.id)?.rank ?? Infinity) || a.name.localeCompare(b.name);
  const order = (members: Member[]) => [...members].sort(ranked ? byMetric : (a, b) => a.name.localeCompare(b.name));

  const teamTotal = (teamId: string) => {
    const stats = (s.membersByTeam.get(teamId) ?? []).map((m) => s.stats.get(m.id)!).filter(Boolean);
    switch (metric) {
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

  const PersonRow = ({ userId, team, showTeam }: { userId: string; team: Team; showTeam: boolean }) => {
    const r = rowOf.get(userId);
    const v = valueOf(userId);
    return (
      <li className="flex items-center gap-3 px-4 py-2.5">
        {ranked && (
          <span className={`tnum w-7 shrink-0 text-center font-display text-xl font-bold ${r && r.rank <= 3 ? "text-accent-ink" : "text-muted"}`}>{r?.rank ?? "–"}</span>
        )}
        <Avatar name={nameOf(userId)} color={team.color} />
        <span className="min-w-0 flex-1">
          <Link href={`/players/${userId}`} className="block truncate font-semibold hover:underline">
            {nameOf(userId)}
          </Link>
          <span className="block truncate text-xs text-muted">
            {[team.leadUserId === userId ? "Captain" : null, showTeam ? team.name : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="tnum block font-display text-lg font-bold leading-tight">{v.main}</span>
          <span className="tnum block text-xs text-muted">{v.unit}</span>
          {changeOf(r) && <span className="flex justify-end">{changeOf(r)}</span>}
        </span>
      </li>
    );
  };

  const teams = sort === "league"
    ? s.standings.map((r) => s.teams.find((t) => t.id === r.teamId)!)
    : [...s.teams].sort((a, b) => teamTotal(b.id).value - teamTotal(a.id).value);
  const everyone = order(s.participants);
  const teamById = new Map(s.teams.map((t) => [t.id, t]));

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
      <p className="mb-4 text-sm text-muted">{meta.note}</p>

      {metric === "improved" && board.length === 0 && (
        <div className="mb-4">
          <Notice>Most improved starts after two weeks: we need a first week and a later week to compare.</Notice>
        </div>
      )}

      {view === "players" ? (
        <Card>
          <ol className="divide-y divide-line-2">
            {everyone.map((m) => (
              <PersonRow key={m.id} userId={m.id} team={teamById.get(m.teamId!)!} showTeam />
            ))}
          </ol>
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
                  <ul className="divide-y divide-line-2">
                    {members.map((m) => (
                      <PersonRow key={m.id} userId={m.id} team={t} showTeam={false} />
                    ))}
                  </ul>
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
