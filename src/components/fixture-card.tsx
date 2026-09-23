import { CheckCircle2, Clock } from "lucide-react";
import { formatRange } from "@/lib/engine/dates";
import type { FixtureResult, FixtureSide } from "@/lib/engine/engine";
import type { Team } from "@/lib/engine/types";
import { TeamIcon } from "./team";
import { Chip, LiveDot } from "./ui";

function StatusChip({ f }: { f: FixtureResult }) {
  if (f.status === "live")
    return (
      <Chip tone="live">
        <LiveDot /> Live
      </Chip>
    );
  if (f.status === "upcoming")
    return (
      <Chip>
        <Clock className="size-3" aria-hidden="true" /> Upcoming
      </Chip>
    );
  if (f.week.provisional) return <Chip tone="warn">Result pending corrections</Chip>;
  return (
    <Chip tone="good">
      <CheckCircle2 className="size-3" aria-hidden="true" /> Full time
    </Chip>
  );
}

function Row({ side, team, leading, f }: { side: FixtureSide; team: Team; leading: boolean; f: FixtureResult }) {
  const won = f.outcome === team.id;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <TeamIcon team={team} size="md" />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] ${leading ? "font-bold text-ink" : "font-semibold text-ink-2"}`}>
          {team.name}
          {won && <span className="ml-2 align-middle text-xs font-bold uppercase tracking-wide text-win">Won</span>}
        </p>
        {f.status === "live" && side.possible > 0 && (
          <p className="tnum text-xs text-muted">
            {side.points} of {side.possible} possible so far
          </p>
        )}
      </div>
      <span className={`tnum font-display text-3xl font-bold leading-none ${leading ? "text-ink" : "text-muted"}`}>{f.status === "upcoming" ? "–" : side.points}</span>
    </div>
  );
}

export function FixtureCard({ f, teams, highlightTeamId }: { f: FixtureResult; teams: Map<string, Team>; highlightTeamId?: string }) {
  const home = teams.get(f.home.teamId)!;
  const away = teams.get(f.away.teamId)!;
  const total = f.home.points + f.away.points;
  const homePct = total > 0 ? (f.home.points / total) * 100 : 50;
  const involved = highlightTeamId && (highlightTeamId === home.id || highlightTeamId === away.id);
  const summary =
    f.status === "upcoming"
      ? `${home.name} versus ${away.name}, upcoming`
      : `${home.name} ${f.home.points}, ${away.name} ${f.away.points}${f.status === "live" ? ", live" : f.outcome === "draw" ? ", draw" : ""}`;
  return (
    <article className={`rounded-2xl border bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${involved ? "border-night-3 ring-1 ring-night-3/30" : "border-line"}`} aria-label={summary}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold uppercase tracking-wider text-muted">
          Week {f.week.number} · {formatRange(f.week.start, f.week.end)}
          {f.week.finalSprint && <span className="ml-1.5 text-accent-ink">· Final Sprint</span>}
        </p>
        <StatusChip f={f} />
      </div>
      <Row side={f.home} team={home} leading={f.leaderId === home.id || (f.leaderId === null && total > 0)} f={f} />
      <Row side={f.away} team={away} leading={f.leaderId === away.id || (f.leaderId === null && total > 0)} f={f} />
      {f.status !== "upcoming" && (
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-line-2" aria-hidden="true">
          <div style={{ width: `${homePct}%`, backgroundColor: home.color }} />
          <div style={{ width: `${100 - homePct}%`, backgroundColor: away.color }} />
        </div>
      )}
      {f.status === "completed" && f.outcome === "draw" && <p className="mt-2 text-xs font-semibold text-muted">Draw: 1 league point each</p>}
    </article>
  );
}
