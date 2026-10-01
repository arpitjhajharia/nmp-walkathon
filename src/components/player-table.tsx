import { Crown, Flame, Handshake, Star, TrendingUp, Trophy, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { BADGE_ICONS } from "./badges";
import { BADGES, type BadgeId, type Season, type StepLeaders, type WeeklyAwards } from "@/lib/engine/engine";
import { formatShort } from "@/lib/engine/dates";
import { Avatar, fmt, shortName } from "./ui";

/**
 * One row per person, one column per thing. Points, steps and the daily average are the
 * three figures people compare, and awards and the streak each get a column of their own
 * rather than being spelled out under every name. The team is the avatar colour.
 */

export type Honour = "yesterday" | "total";

// Two tones, not two shades: the season honour is the dark, settled one and yesterday's is
// the bright one, so a glance tells them apart even when one person holds both.
const HONOUR = {
  yesterday: { icon: Zap, label: "Best yesterday", title: "Most steps on the latest scored day", className: "bg-accent text-night", iconClass: "" },
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

/** One thing a person has won or unlocked, drawn as a single chip in the awards column. */
export interface Accolade {
  key: string;
  icon: LucideIcon;
  /** What it is called. */
  label: string;
  /** How it was won and when, read on hover and by screen readers. */
  detail: string;
  tone: "honour" | "award" | "badge";
  /** Times won, for awards that come round every week. */
  count?: number;
}

// Three tiers of recognition, three tones: honours held right now are the bright ones,
// awards won on a Sunday are the dark ones, badges unlocked for good are the quiet ones.
const TONE: Record<Accolade["tone"], string> = {
  honour: "bg-accent text-night",
  award: "bg-night text-white",
  badge: "bg-line-2 text-ink-2",
};

const WEEKLY: { key: keyof Omit<WeeklyAwards, "weekIndex" | "final">; label: string; how: string; icon: LucideIcon }[] = [
  { key: "mvp", label: "Weekly MVP", how: "Most steps that week", icon: Trophy },
  { key: "consistency", label: "Consistency Star", how: "Most 5k+ days that week", icon: Star },
  { key: "comeback", label: "Comeback Walker", how: "Biggest rise in daily average", icon: TrendingUp },
  { key: "teamPlayer", label: "Team Player", how: "Top contributor in the most active team", icon: Handshake },
];

// Tiered badges collapse to the highest one earned, so a row never repeats the same icon.
// First Steps is left out: everyone who walks a day has it, so it separates nobody.
const BADGE_TIERS: BadgeId[][] = [
  ["streak_25", "streak_10", "streak_5"],
  ["club_250k", "club_100k"],
  ["goal_getter"],
  ["team_contributor"],
];

/**
 * Everything one person has to show for the season, in a fixed order: honours first, then
 * the awards decided on Sundays, then the badges they have unlocked. Only settled weeks
 * count, so the column does not change under people while a week is still being walked.
 */
export function accoladesFor(s: Season, userId: string): Accolade[] {
  const out: Accolade[] = [];
  const st = s.stats.get(userId);

  for (const h of honoursFor(s.stepLeaders, userId)) {
    const figure = h === "total" ? st && `${fmt(st.totalSteps)} steps` : st?.latest.steps != null ? `${fmt(st.latest.steps)} steps` : null;
    out.push({
      key: h,
      icon: HONOUR[h].icon,
      label: HONOUR[h].label,
      detail: [HONOUR[h].title, figure].filter(Boolean).join(" · "),
      tone: "honour",
    });
  }

  for (const w of WEEKLY) {
    const won = s.weeklyAwards.filter((a) => a.final && a[w.key].some((x) => x.userId === userId));
    if (won.length === 0) continue;
    const weeks = won.map((a) => s.weeks[a.weekIndex].number);
    out.push({
      key: w.key,
      icon: w.icon,
      label: w.label,
      detail: `${w.how} · ${weeks.length > 1 ? `weeks ${listOf(weeks)}` : `week ${weeks[0]}`}`,
      tone: "award",
      count: won.length,
    });
  }

  const earned = new Map((st?.badges ?? []).filter((b) => b.unlockedOn).map((b) => [b.id, b.unlockedOn!]));
  for (const tier of BADGE_TIERS) {
    const top = tier.find((id) => earned.has(id));
    if (!top) continue;
    const badge = BADGES.find((b) => b.id === top)!;
    out.push({
      key: top,
      icon: BADGE_ICONS[top],
      label: badge.name,
      detail: `${badge.description} Unlocked ${formatShort(earned.get(top)!)}.`,
      tone: "badge",
    });
  }

  return out;
}

/** "2, 4 and 7" — the weeks an award was won, in the order they were walked. */
function listOf(ns: number[]): string {
  if (ns.length < 2) return String(ns[0] ?? "");
  return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}

/**
 * The awards cell. Every chip is shown — nothing hides behind a count — and each one names
 * itself on hover or keyboard focus, since an icon on its own only half tells the story.
 * Rows near the foot of the table open their tooltip upwards so it is not cut off.
 */
export function Accolades({ items, up = false }: { items: Accolade[]; up?: boolean }) {
  if (items.length === 0) return <span className="text-muted">–</span>;
  return (
    <span className="flex flex-wrap items-center gap-1 py-1.5">
      {items.map((a) => (
        <span key={a.key} className="group relative inline-flex">
          <span
            tabIndex={0}
            className={`inline-flex cursor-default items-start rounded-full px-1.5 py-1 outline-none group-hover:ring-2 group-hover:ring-night/20 group-focus-within:ring-2 group-focus-within:ring-night/40 ${TONE[a.tone]}`}
          >
            <a.icon className="size-3.5 shrink-0" aria-hidden="true" />
            {a.count && a.count > 1 ? <sup className="ml-px text-[9px] font-bold leading-none">{a.count}</sup> : null}
            <span className="sr-only">
              {a.label}
              {a.count && a.count > 1 ? `, won ${a.count} times` : ""}. {a.detail}
            </span>
          </span>
          <span
            role="tooltip"
            aria-hidden="true"
            className={`pointer-events-none absolute left-0 z-20 hidden w-52 rounded-lg bg-night px-2.5 py-2 text-left text-[11px] font-medium normal-case leading-snug tracking-normal text-white shadow-lg group-hover:block group-focus-within:block ${
              up ? "bottom-full mb-1.5" : "top-full mt-1.5"
            }`}
          >
            <span className="block font-bold">
              {a.label}
              {a.count && a.count > 1 ? ` ×${a.count}` : ""}
            </span>
            <span className="mt-0.5 block text-white/70">{a.detail}</span>
          </span>
        </span>
      ))}
    </span>
  );
}

/** Days in a row at the active step mark. Three days in is when it becomes a run worth keeping. */
function Streak({ days }: { days: number | null | undefined }) {
  if (!days) return <span className="text-muted">–</span>;
  return days >= 3 ? (
    <span className="tnum inline-flex items-center gap-0.5 font-semibold text-orange-600" title={`${days} days in a row`}>
      <Flame className="size-3.5" aria-hidden="true" />
      {days}
      <span className="sr-only"> day streak</span>
    </span>
  ) : (
    <span className="tnum text-muted" title={`${days} days in a row`}>
      {days}
    </span>
  );
}

export interface PlayerRow {
  userId: string;
  name: string;
  /** Team colour for the avatar; omitted for people no longer on the team. */
  color?: string;
  /** Captain, team name — whatever still belongs under the name. */
  meta?: string;
  rank?: number | null;
  points: number;
  steps: number;
  /** Steps per recorded day, or null before anyone has recorded one. */
  avg: number | null;
  /** Days in a row at 5,000+ steps. */
  streak?: number | null;
  /** Honours, weekly awards and badges, from `accoladesFor`. */
  awards?: Accolade[];
  /** The sorted-by figure when it is not one of the three columns. */
  extra?: React.ReactNode;
  /** Movement arrow or similar, rendered as given. */
  change?: React.ReactNode;
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
  awards = false,
  streak = false,
}: {
  rows: PlayerRow[];
  caption: string;
  nameLabel?: string;
  extraLabel?: string;
  changeLabel?: string;
  ranked?: boolean;
  awards?: boolean;
  streak?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="tnum w-full min-w-[420px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
            {ranked && (
              <th scope="col" className="w-10 py-2 pl-4 pr-1 sm:pl-3">
                <abbr title="Position" className="no-underline">#</abbr>
              </th>
            )}
            <th scope="col" className={`py-2 pr-2 ${ranked ? "" : "pl-4 sm:pl-3"}`}>{nameLabel}</th>
            {awards && <th scope="col" className="w-[124px] px-2 py-2">Awards</th>}
            {streak && <th scope="col" className="px-2 py-2 text-right">Streak</th>}
            {extraLabel && <th scope="col" className="px-2 py-2 text-right">{extraLabel}</th>}
            <th scope="col" className="px-2 py-2 text-right text-ink">
              <abbr title="Team points contributed" className="no-underline">Pts</abbr>
            </th>
            <th scope="col" className={`px-2 py-2 text-right ${changeLabel ? "" : "pr-4 sm:pr-2"}`}>Steps</th>
            <th scope="col" className={`hidden px-2 py-2 text-right sm:table-cell ${changeLabel ? "" : "sm:pr-3"}`}>Avg / day</th>
            {changeLabel && <th scope="col" className="py-2 pl-2 pr-4 text-right sm:pr-3">{changeLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.userId} className="border-b border-line-2 last:border-0">
              {ranked && (
                <td className={`py-2.5 pl-4 pr-1 font-display text-lg font-bold sm:pl-3 ${r.rank && r.rank <= 3 ? "text-accent-ink" : "text-muted"}`}>{r.rank ?? "–"}</td>
              )}
              <td className={`py-2.5 pr-2 ${ranked ? "" : "pl-4 sm:pl-3"}`}>
                <span className="flex items-center gap-2.5">
                  <Avatar name={r.name} color={r.color} />
                  <span className="min-w-0">
                    <Link
                      href={`/players/${r.userId}`}
                      title={r.name}
                      className={`block whitespace-nowrap font-semibold hover:underline ${r.faded ? "text-muted" : ""}`}
                    >
                      <span aria-hidden="true">{shortName(r.name)}</span>
                      <span className="sr-only">{r.name}</span>
                    </Link>
                    {r.meta && <span className="block truncate text-xs text-muted">{r.meta}</span>}
                  </span>
                </span>
              </td>
              {awards && (
                <td className="px-2">
                  <Accolades items={r.awards ?? []} up={rows.length > 3 && i >= rows.length - 2} />
                </td>
              )}
              {streak && (
                <td className="px-2 text-right">
                  <Streak days={r.streak} />
                </td>
              )}
              {extraLabel && <td className="px-2 text-right">{r.extra ?? "–"}</td>}
              <td className="px-2 text-right font-display text-lg font-bold leading-none text-ink">{fmt(r.points)}</td>
              <td className={`px-2 text-right font-semibold text-ink-2 ${changeLabel ? "" : "pr-4 sm:pr-2"}`}>{fmt(r.steps)}</td>
              <td className={`hidden px-2 text-right text-muted sm:table-cell ${changeLabel ? "" : "sm:pr-3"}`}>{r.avg === null ? "–" : fmt(r.avg)}</td>
              {changeLabel && <td className="py-2.5 pl-2 pr-4 text-right sm:pr-3">{r.change ?? null}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
