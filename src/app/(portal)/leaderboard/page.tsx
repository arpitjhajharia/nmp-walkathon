import type { Metadata } from "next";
import { Tabs } from "@/components/tabs";
import { TeamIcon } from "@/components/team";
import { Card, EmptyState, Movement, PageHeader, fmt } from "@/components/ui";
import type { LeaderRow } from "@/lib/engine/engine";
import { requireUser } from "@/lib/server/auth";
import { getPortal } from "@/lib/server/season";

export const metadata: Metadata = { title: "Leaderboard" };

const TABS = [
  { id: "total", label: "Total steps", note: "Highest cumulative steps this season. Arrows show movement since last Sunday." },
  { id: "consistency", label: "Consistency", note: "Most days at or above 5,000 steps. The small number shows days added this week." },
  { id: "improved", label: "Most improved", note: "Latest 7-day average compared with your first 7-day average. Only days with an entry count (at least 3 in each window)." },
  { id: "week", label: "This week", note: "Total steps since Monday. The small number is the change against last week's total." },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab: TabId = TABS.some((t) => t.id === sp.tab) ? (sp.tab as TabId) : "total";
  const { season: s, nameOf } = getPortal();
  const teams = new Map(s.teams.map((t) => [t.id, t]));
  const rows: LeaderRow[] = s.leaderboards[tab];
  const meta = TABS.find((t) => t.id === tab)!;

  const value = (r: LeaderRow) => {
    const st = s.stats.get(r.userId)!;
    switch (tab) {
      case "total":
      case "week":
        return { main: fmt(r.value), unit: "steps" };
      case "consistency":
        return { main: String(r.value), unit: r.value === 1 ? "day" : "days" };
      case "improved":
        return { main: `${r.value >= 0 ? "+" : ""}${r.value.toFixed(0)}%`, unit: `${fmt(st.first7Avg ?? 0)} → ${fmt(st.latest7Avg ?? 0)} a day` };
    }
  };
  const change = (r: LeaderRow) => {
    if (tab === "total") return <Movement value={r.change} />;
    if (tab === "consistency") return r.change ? <span className="tnum text-xs font-semibold text-win">+{r.change} this week</span> : null;
    if (tab === "week") return r.change === null ? null : <Movement value={r.change} />;
    return null;
  };

  const Row = ({ r }: { r: LeaderRow }) => {
    const st = s.stats.get(r.userId)!;
    const team = teams.get(st.teamId)!;
    const v = value(r);
    const me = r.userId === user.id;
    return (
      <li className={`flex items-center gap-3 px-4 py-3 ${me ? "bg-sky-50" : ""}`}>
        <span className={`tnum w-7 text-center font-display text-2xl font-bold ${r.rank <= 3 ? "text-accent-ink" : "text-muted"}`}>{r.rank}</span>
        <TeamIcon team={team} size="md" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold leading-snug">
            {nameOf(r.userId)}
            {me && <span className="ml-1.5 text-xs font-semibold text-sky-800">You</span>}
          </p>
          <p className="truncate text-xs text-muted">{team.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum font-display text-xl font-bold leading-tight">{v.main}</p>
          <p className="tnum text-xs text-muted">{v.unit}</p>
          <div className="flex justify-end">{change(r)}</div>
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Individual recognition" title="Leaderboard">
        Just for fun: individual results never change team points.
      </PageHeader>
      <Tabs label="Leaderboard views" active={tab} tabs={TABS.map((t) => ({ id: t.id, label: t.label, href: `/leaderboard?tab=${t.id}` }))} />
      <p className="mb-4 text-sm text-muted">{meta.note}</p>
      {rows.length === 0 ? (
        <EmptyState title={tab === "improved" ? "Most improved starts after two weeks" : "No steps recorded yet"}>
          {tab === "improved" ? "We need your first week and a later week to compare." : "Entries will appear here as soon as team leads save them."}
        </EmptyState>
      ) : (
        <Card>
          <ol className="divide-y divide-line-2">
            {rows.map((r) => (
              <Row key={r.userId} r={r} />
            ))}
          </ol>
        </Card>
      )}
    </>
  );
}
