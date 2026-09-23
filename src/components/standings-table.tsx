import type { StandingRow } from "@/lib/engine/engine";
import type { Team } from "@/lib/engine/types";
import { TeamBadge } from "./team";
import { FormGuide, Movement, compact, fmt } from "./ui";

export function StandingsTable({ rows, teams }: { rows: StandingRow[]; teams: Map<string, Team> }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="tnum w-full min-w-[520px] border-collapse text-sm">
        <caption className="sr-only">League table</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
            <th scope="col" className="w-12 py-2 pl-4 pr-2 sm:pl-3">
              <abbr title="Position" className="no-underline">Pos</abbr>
            </th>
            <th scope="col" className="sticky left-0 bg-surface py-2 pr-2">Team</th>
            <th scope="col" className="px-2 py-2 text-center"><abbr title="Played" className="no-underline">P</abbr></th>
            <th scope="col" className="px-2 py-2 text-center"><abbr title="Won" className="no-underline">W</abbr></th>
            <th scope="col" className="px-2 py-2 text-center"><abbr title="Drawn" className="no-underline">D</abbr></th>
            <th scope="col" className="px-2 py-2 text-center"><abbr title="Lost" className="no-underline">L</abbr></th>
            <th scope="col" className="px-2 py-2 text-center text-ink"><abbr title="League points" className="no-underline">Pts</abbr></th>
            <th scope="col" className="px-2 py-2">Form</th>
            <th scope="col" className="px-2 py-2 text-right">Activity pts</th>
            <th scope="col" className="px-2 py-2 text-right">Steps</th>
            <th scope="col" className="py-2 pl-2 pr-4 text-right sm:pr-3"><abbr title="Movement since the previous week" className="no-underline">Move</abbr></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const team = teams.get(r.teamId)!;
            return (
              <tr key={r.teamId} className="border-b border-line-2 last:border-0">
                <td className="py-2.5 pl-4 font-display text-lg font-bold sm:pl-3">{r.position}</td>
                <td className="sticky left-0 bg-surface py-2.5 pr-2">
                  <TeamBadge team={team} size="sm" link />
                </td>
                <td className="px-2 text-center">{r.played}</td>
                <td className="px-2 text-center">{r.won}</td>
                <td className="px-2 text-center">{r.drawn}</td>
                <td className="px-2 text-center">{r.lost}</td>
                <td className="px-2 text-center font-display text-lg font-bold">{r.points}</td>
                <td className="px-2">
                  <FormGuide form={r.form} />
                </td>
                <td className="px-2 text-right font-semibold">{fmt(r.activity)}</td>
                <td className="px-2 text-right text-muted">{compact(r.steps)}</td>
                <td className="py-2.5 pl-2 pr-4 text-right sm:pr-3">
                  <Movement value={r.movement} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
