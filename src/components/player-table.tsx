import { Crown, Flame } from "lucide-react";
import Link from "next/link";
import type { StepLeaders } from "@/lib/engine/engine";
import { Avatar, fmt } from "./ui";

/**
 * One row per person, one column per number. Points, steps and the daily average are the
 * three figures people actually compare, so they are named once in the header rather than
 * spelled out again on every row.
 */

export type Honour = "yesterday" | "total";

// Two tones, not two shades: the season honour is the dark, settled one and yesterday's is
// the bright one, so a glance tells them apart even when one person holds both.
const HONOUR = {
  yesterday: { icon: Flame, label: "Best yesterday", title: "Most steps on the latest scored day", className: "bg-accent text-night", iconClass: "" },
  total: { icon: Crown, label: "Most steps", title: "Most steps in the season so far", className: "bg-night text-white", iconClass: "text-accent" },
} as const;

/** Reads the season's honours for one person. Order is fixed so badges never shuffle. */
export function honoursFor(leaders: StepLeaders, userId: string): Honour[] {
  const out: Honour[] = [];
  if (leaders.total.includes(userId)) out.push("total");
  if (leaders.yesterday.includes(userId)) out.push("yesterday");
  return out;
}

export function HonourBadge({ kind }: { kind: Honour }) {
  const h = HONOUR[kind];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${h.className}`} title={h.title}>
      <h.icon className={`size-3 ${h.iconClass}`} aria-hidden="true" />
      {h.label}
    </span>
  );
}

export interface PlayerRow {
  userId: string;
  name: string;
  /** Team colour for the avatar; omitted for people no longer on the team. */
  color?: string;
  /** Captain, team name, streak — whatever belongs under the name. */
  meta?: string;
  rank?: number | null;
  points: number;
  steps: number;
  /** Steps per recorded day, or null before anyone has recorded one. */
  avg: number | null;
  /** The sorted-by figure when it is not one of the three columns. */
  extra?: React.ReactNode;
  /** Movement arrow or similar, rendered as given. */
  change?: React.ReactNode;
  honours?: Honour[];
  /** Dims the name for former members. */
  faded?: boolean;
}

export function PlayerTable({
  rows,
  caption,
  nameLabel = "Player",
  extraLabel,
  changeLabel,
  ranked = false,
}: {
  rows: PlayerRow[];
  caption: string;
  nameLabel?: string;
  extraLabel?: string;
  changeLabel?: string;
  ranked?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="tnum w-full min-w-[360px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
            {ranked && (
              <th scope="col" className="w-10 py-2 pl-4 pr-1 sm:pl-3">
                <abbr title="Position" className="no-underline">#</abbr>
              </th>
            )}
            <th scope="col" className={`py-2 pr-2 ${ranked ? "" : "pl-4 sm:pl-3"}`}>{nameLabel}</th>
            {extraLabel && <th scope="col" className="px-2 py-2 text-right">{extraLabel}</th>}
            <th scope="col" className="px-2 py-2 text-right text-ink">
              <abbr title="Team points contributed" className="no-underline">Pts</abbr>
            </th>
            <th scope="col" className="px-2 py-2 text-right">Steps</th>
            <th scope="col" className={`px-2 py-2 text-right ${changeLabel ? "" : "pr-4 sm:pr-3"}`}>Avg / day</th>
            {changeLabel && <th scope="col" className="py-2 pl-2 pr-4 text-right sm:pr-3">{changeLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="border-b border-line-2 last:border-0">
              {ranked && (
                <td className={`py-2.5 pl-4 pr-1 font-display text-lg font-bold sm:pl-3 ${r.rank && r.rank <= 3 ? "text-accent-ink" : "text-muted"}`}>{r.rank ?? "–"}</td>
              )}
              <td className={`py-2.5 pr-2 ${ranked ? "" : "pl-4 sm:pl-3"}`}>
                <span className="flex items-center gap-2.5">
                  <Avatar name={r.name} color={r.color} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link href={`/players/${r.userId}`} className={`whitespace-nowrap font-semibold hover:underline ${r.faded ? "text-muted" : ""}`}>
                        {r.name}
                      </Link>
                      {r.honours?.map((h) => (
                        <HonourBadge key={h} kind={h} />
                      ))}
                    </span>
                    {r.meta && <span className="block truncate text-xs text-muted">{r.meta}</span>}
                  </span>
                </span>
              </td>
              {extraLabel && <td className="px-2 text-right">{r.extra ?? "–"}</td>}
              <td className="px-2 text-right font-display text-lg font-bold leading-none">{fmt(r.points)}</td>
              <td className="px-2 text-right font-semibold">{fmt(r.steps)}</td>
              <td className={`px-2 text-right text-muted ${changeLabel ? "" : "pr-4 sm:pr-3"}`}>{r.avg === null ? "–" : fmt(r.avg)}</td>
              {changeLabel && <td className="py-2.5 pl-2 pr-4 text-right sm:pr-3">{r.change ?? null}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
