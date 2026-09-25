// The competition engine. Everything shown in the portal is derived here from raw
// entries, leave records and settings, so any save or correction automatically flows
// through to daily scores, fixtures, standings, trophies, awards and badges.

import {
  addDays,
  dateRange,
  diffDays,
  formatRange,
  monthKey,
  monthName,
  mondayOf,
  weekday,
  type ISODate,
} from "./dates.ts";
import type { Band, Challenge, ChallengeType, Fixture, Member, Membership, Settings, Snapshot, Team } from "./types.ts";

export const GOAL_STEPS = 10_000;

// ───────────────────────── Step bands ─────────────────────────

export function sortedBands(bands: Band[]): Band[] {
  return [...bands].sort((a, b) => a.min - b.min);
}

export function pointsFor(steps: number, bands: Band[]): number {
  let pts = 0;
  for (const b of sortedBands(bands)) if (steps >= b.min) pts = b.points;
  return pts;
}

export function maxDailyPoints(bands: Band[]): number {
  return Math.max(0, ...bands.map((b) => b.points));
}

/**
 * Minimum steps that earn more than the base band (5,000 by default). Streaks, consistency
 * and active-day counts hang off this, so it has to mean a real walk rather than the point
 * every recorded day is already worth.
 */
export function activeThreshold(bands: Band[]): number {
  const sorted = sortedBands(bands);
  const base = sorted[0]?.points ?? 0;
  return sorted.find((b) => b.points > base)?.min ?? 5000;
}

/** The next band above the given step count, or null when already in the top band. */
export function nextBand(steps: number, bands: Band[]): { min: number; points: number; gap: number } | null {
  const next = sortedBands(bands).find((b) => b.min > steps && b.points > pointsFor(steps, bands));
  return next ? { min: next.min, points: next.points, gap: next.min - steps } : null;
}

export function bandLabel(band: Band, bands: Band[]): string {
  const sorted = sortedBands(bands);
  const i = sorted.findIndex((b) => b.min === band.min);
  const next = sorted[i + 1];
  if (band.min === 0 && next) return `Under ${next.min.toLocaleString("en-US")}`;
  if (!next) return `${band.min.toLocaleString("en-US")}+`;
  return `${band.min.toLocaleString("en-US")}–${(next.min - 1).toLocaleString("en-US")}`;
}

// ───────────────────────── Challenges & badges ─────────────────────────

export const CHALLENGE_TYPES: Record<ChallengeType, { title: string; description: string }> = {
  five_day_move: { title: "Five-Day Move", description: "Record at least 5,000 steps on five days this week." },
  weekend_walk: { title: "Weekend Walk", description: "Record at least 8,000 steps on Saturday or Sunday." },
  streak_builder: { title: "Streak Builder", description: "Have steps recorded on all seven days this week (leave days count)." },
  ten_k_day: { title: "10k Day", description: "Reach at least 10,000 steps on one day this week." },
};

export type BadgeId =
  | "first_steps"
  | "streak_5"
  | "streak_10"
  | "streak_25"
  | "club_100k"
  | "club_250k"
  | "goal_getter"
  | "team_contributor";

export const BADGES: { id: BadgeId; name: string; description: string; target: number; unit: string }[] = [
  { id: "first_steps", name: "First Steps", description: "Your first day on the board.", target: 1, unit: "day" },
  { id: "streak_5", name: "5-Day Streak", description: "Five days in a row at 5,000+ steps.", target: 5, unit: "days" },
  { id: "streak_10", name: "10-Day Streak", description: "Ten days in a row at 5,000+ steps.", target: 10, unit: "days" },
  { id: "streak_25", name: "25-Day Streak", description: "Twenty-five days in a row at 5,000+ steps.", target: 25, unit: "days" },
  { id: "club_100k", name: "100k Club", description: "100,000 steps in total.", target: 100_000, unit: "steps" },
  { id: "club_250k", name: "250k Club", description: "250,000 steps in total.", target: 250_000, unit: "steps" },
  { id: "goal_getter", name: "Goal Getter", description: "Ten days at 10,000+ steps.", target: 10, unit: "days" },
  { id: "team_contributor", name: "Team Contributor", description: "Earned team points on 20 days.", target: 20, unit: "days" },
];

// ───────────────────────── Result types ─────────────────────────

export type EntryStatus = "complete" | "partial" | "none";
export type Phase = "pre" | "live" | "finished";
export type RaceStatus = "upcoming" | "live" | "completed";

export interface MemberDay {
  steps: number | null;
  leave: boolean;
  points: number;
}

export interface TeamDay {
  date: ISODate;
  earned: number;
  possible: number;
  steps: number;
  recorded: number;
  members: number;
  status: EntryStatus;
}

export interface WeekInfo {
  index: number;
  number: number;
  start: ISODate;
  end: ISODate;
  dates: ISODate[];
  status: RaceStatus;
  /** Completed, but a correction may still change it. */
  provisional: boolean;
  finalSprint: boolean;
}

export interface FixtureSide {
  teamId: string;
  points: number;
  /** Points available on the days counted so far, so today is not held against a team. */
  possible: number;
  steps: number;
}

export interface FixtureResult {
  id: string;
  week: WeekInfo;
  home: FixtureSide;
  away: FixtureSide;
  status: RaceStatus;
  /** Winning team id, "draw", or null while not completed. */
  outcome: string | "draw" | null;
  leaderId: string | null;
}

export type FormResult = "W" | "D" | "L";

export interface StandingRow {
  teamId: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  activity: number;
  steps: number;
  form: FormResult[];
  movement: number | null;
}

export interface TrophyRace {
  key: string;
  label: string;
  start: ISODate;
  end: ISODate;
  status: RaceStatus;
  totals: { teamId: string; points: number }[];
  winners: string[];
}

export interface BadgeStatus {
  id: BadgeId;
  unlockedOn: ISODate | null;
  progress: number;
  target: number;
}

/** The three numbers every player table shows, in the order they break a tie. */
export interface PlayerTotals {
  points: number;
  steps: number;
  /** Steps per recorded day, or null before anything is recorded. */
  avg: number | null;
}

/**
 * How players are ordered wherever one is not explicitly sorted another way: team points
 * first, because that is what the season is scored on, then steps, then the daily average.
 */
export function byPlayerTotals(a: PlayerTotals, b: PlayerTotals): number {
  return b.points - a.points || b.steps - a.steps || (b.avg ?? 0) - (a.avg ?? 0);
}

export interface MemberStats {
  userId: string;
  teamId: string;
  totalSteps: number;
  daysRecorded: number;
  /** Steps per recorded day. Null until a first day is recorded. */
  avgSteps: number | null;
  consistencyDays: number;
  goalDays: number;
  pointsContributed: number;
  contributionDays: number;
  currentStreak: number;
  bestStreak: number;
  first7Avg: number | null;
  latest7Avg: number | null;
  improvementPct: number | null;
  thisWeekSteps: number;
  thisWeekActiveDays: number;
  lastWeekSteps: number;
  badges: BadgeStatus[];
  /** The most recent day that counts, which is yesterday. */
  latest: MemberDay;
}

export interface AwardWinner {
  userId: string;
  value: number;
  detail: string;
}

export interface WeeklyAwards {
  weekIndex: number;
  final: boolean;
  mvp: AwardWinner[];
  consistency: AwardWinner[];
  comeback: AwardWinner[];
  teamPlayer: AwardWinner[];
}

export interface LeaderRow {
  userId: string;
  rank: number;
  value: number;
  change: number | null;
}

export interface StepLeaders {
  /** Most steps on the last counted day. */
  yesterday: string[];
  /** Most steps across the season so far. */
  total: string[];
}

export interface ChallengeProgress {
  userId: string;
  current: number;
  target: number;
  completed: boolean;
}

export interface WeekChallenge {
  weekIndex: number;
  type: ChallengeType;
  title: string;
  description: string;
  progress: ChallengeProgress[];
}

export interface BadgeUnlock {
  userId: string;
  badgeId: BadgeId;
  date: ISODate;
}

export interface Season {
  settings: Settings;
  today: ISODate;
  /**
   * The last day whose steps count. People report yesterday's total the next morning, so
   * today is never scored: every total, streak and "possible" figure stops here.
   */
  lastCounted: ISODate;
  phase: Phase;
  start: ISODate;
  end: ISODate;
  dayNumber: number;
  daysRemaining: number;
  dates: ISODate[];
  countedDates: ISODate[];
  maxDaily: number;
  activeSteps: number;
  teams: Team[];
  participants: Member[];
  /** Current members of each team. */
  membersByTeam: Map<string, Member[]>;
  memberships: Map<string, Membership[]>;
  /** Team the member was on for a given date, or null. */
  teamOf: (userId: string, date: ISODate) => string | null;
  /** Everyone who was on the team on a given date (including people who have since moved). */
  rosterOn: (teamId: string, date: ISODate) => Member[];
  memberDay: (userId: string, date: ISODate) => MemberDay;
  teamDay: (teamId: string, date: ISODate) => TeamDay;
  weeks: WeekInfo[];
  currentWeek: WeekInfo | null;
  lastCompletedWeek: WeekInfo | null;
  fixtures: FixtureResult[];
  standings: StandingRow[];
  standingsAfter: (weekIndex: number) => StandingRow[];
  monthlyCups: TrophyRace[];
  finalSprint: TrophyRace;
  champion: string[];
  stats: Map<string, MemberStats>;
  leaderboards: { points: LeaderRow[]; total: LeaderRow[]; consistency: LeaderRow[]; improved: LeaderRow[]; week: LeaderRow[] };
  /**
   * The people out in front on raw steps, named so their effort can be badged wherever they
   * appear. Joint holders all count; nobody holds an honour on zero steps.
   */
  stepLeaders: StepLeaders;
  weeklyAwards: WeeklyAwards[];
  challenges: WeekChallenge[];
  badgeUnlocks: BadgeUnlock[];
}

// ───────────────────────── Helpers ─────────────────────────

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Standard competition ranking: equal values share a rank (1, 1, 3). */
/** Ranks on a comparator. Entries the comparator cannot separate share a position. */
function rankWith<T>(items: T[], cmp: (a: T, b: T) => number): { item: T; rank: number }[] {
  const sorted = [...items].sort(cmp);
  return sorted.map((item, i) => {
    let rank = i + 1;
    for (let j = i - 1; j >= 0 && cmp(sorted[j], item) === 0; j--) rank = j + 1;
    return { item, rank };
  });
}

function rankBy<T>(items: T[], value: (t: T) => number): { item: T; rank: number }[] {
  return rankWith(items, (a, b) => value(b) - value(a));
}

function topBy<T>(items: T[], value: (t: T) => number): T[] {
  if (items.length === 0) return [];
  const best = Math.max(...items.map(value));
  if (!(best > 0)) return [];
  return items.filter((t) => value(t) === best);
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// ───────────────────────── Fixtures schedule ─────────────────────────

/**
 * Rotating round-robin: with four teams there are three pairings per round, so every
 * team meets every other team once every three weeks. Extra teams use the circle method.
 */
export function generateFixtures(teamIds: string[], weekCount: number): Omit<Fixture, "id">[] {
  const ids = [...teamIds];
  if (ids.length < 2) return [];
  if (ids.length % 2 === 1) ids.push("__bye__");
  const n = ids.length;
  const rounds: [string, string][][] = [];
  const rot = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const circle = [ids[0], ...rot];
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) pairs.push([circle[i], circle[n - 1 - i]]);
    rounds.push(pairs);
    rot.unshift(rot.pop()!);
  }
  const out: Omit<Fixture, "id">[] = [];
  for (let w = 0; w < weekCount; w++) {
    const round = rounds[w % rounds.length];
    const flip = Math.floor(w / rounds.length) % 2 === 1;
    for (const [a, b] of round) {
      if (a === "__bye__" || b === "__bye__") continue;
      out.push({ weekIndex: w, homeTeamId: flip ? b : a, awayTeamId: flip ? a : b });
    }
  }
  return out;
}

export function seasonWeeks(startDate: ISODate, lengthDays: number): { start: ISODate; end: ISODate; dates: ISODate[] }[] {
  const end = addDays(startDate, lengthDays - 1);
  const weeks: { start: ISODate; end: ISODate; dates: ISODate[] }[] = [];
  for (let monday = mondayOf(startDate); monday <= end; monday = addDays(monday, 7)) {
    const dates = dateRange(monday, 7).filter((d) => d >= startDate && d <= end);
    weeks.push({ start: dates[0], end: dates[dates.length - 1], dates });
  }
  return weeks;
}

// ───────────────────────── Main computation ─────────────────────────

export function computeSeason(snap: Snapshot, today: ISODate): Season {
  const { settings } = snap;
  const bands = sortedBands(settings.bands);
  const maxDaily = maxDailyPoints(bands);
  const activeSteps = activeThreshold(bands);
  const start = settings.startDate;
  const end = addDays(start, settings.lengthDays - 1);
  const dates = dateRange(start, settings.lengthDays);
  const phase: Phase = today < start ? "pre" : today > end ? "finished" : "live";
  // Steps arrive the morning after the day they were walked, so a day is only scored once
  // it is over. Everything downstream counts up to here, today included in neither.
  const yesterday = addDays(today, -1);
  const lastCounted = yesterday < end ? yesterday : end;
  const countedDates = dates.filter((d) => d <= lastCounted);
  const dayNumber = phase === "pre" ? 0 : phase === "finished" ? settings.lengthDays : diffDays(start, today) + 1;
  const daysRemaining = phase === "pre" ? settings.lengthDays : Math.max(0, diffDays(today, end));

  const teams = [...snap.teams];
  const teamIds = new Set(teams.map((t) => t.id));
  const participants = snap.members.filter((m) => m.active && m.teamId && teamIds.has(m.teamId));
  const membersByTeam = new Map<string, Member[]>(teams.map((t) => [t.id, participants.filter((m) => m.teamId === t.id)]));

  // Team history: steps always count for the team a member was on that day.
  const memberById = new Map(snap.members.map((m) => [m.id, m]));
  const memberships = new Map<string, Membership[]>();
  for (const ms of snap.memberships ?? []) {
    if (!teamIds.has(ms.teamId) || !memberById.has(ms.userId)) continue;
    memberships.set(ms.userId, [...(memberships.get(ms.userId) ?? []), ms]);
  }
  for (const m of participants) if (!memberships.has(m.id)) memberships.set(m.id, [{ userId: m.id, teamId: m.teamId!, from: start, to: null }]);
  const teamOf = (userId: string, date: ISODate): string | null =>
    memberships.get(userId)?.find((ms) => ms.from <= date && (ms.to === null || date <= ms.to))?.teamId ?? null;
  const rosterCache = new Map<string, Member[]>();
  const rosterOn = (teamId: string, date: ISODate): Member[] => {
    const key = `${teamId}|${date}`;
    let v = rosterCache.get(key);
    if (!v) {
      v = [...memberships.keys()].filter((id) => teamOf(id, date) === teamId).map((id) => memberById.get(id)!);
      rosterCache.set(key, v);
    }
    return v;
  };

  const entryMap = new Map<string, number>();
  for (const e of snap.entries) entryMap.set(`${e.userId}|${e.date}`, e.steps);
  const leaveSet = new Set(snap.leaves.map((l) => `${l.userId}|${l.date}`));

  const memberDayCache = new Map<string, MemberDay>();
  const memberDay = (userId: string, date: ISODate): MemberDay => {
    const key = `${userId}|${date}`;
    let v = memberDayCache.get(key);
    if (!v) {
      const leave = leaveSet.has(key);
      const steps = leave ? null : entryMap.get(key) ?? null;
      v = { steps, leave, points: steps === null ? 0 : pointsFor(steps, bands) };
      memberDayCache.set(key, v);
    }
    return v;
  };

  const teamDayCache = new Map<string, TeamDay>();
  const teamDay = (teamId: string, date: ISODate): TeamDay => {
    const key = `${teamId}|${date}`;
    let v = teamDayCache.get(key);
    if (!v) {
      const members = rosterOn(teamId, date);
      let earned = 0, possible = 0, steps = 0, recorded = 0;
      for (const m of members) {
        const d = memberDay(m.id, date);
        if (d.leave) { recorded++; continue; }
        possible += maxDaily;
        if (d.steps !== null) { recorded++; earned += d.points; steps += d.steps; }
      }
      const status: EntryStatus = members.length > 0 && recorded === members.length ? "complete" : recorded > 0 ? "partial" : "none";
      v = { date, earned, possible, steps, recorded, members: members.length, status };
      teamDayCache.set(key, v);
    }
    return v;
  };

  // Weeks
  const sprintStart = addDays(end, -(settings.finalSprintDays - 1));
  const weeks: WeekInfo[] = seasonWeeks(start, settings.lengthDays).map((w, index) => {
    const status: RaceStatus = today < w.start ? "upcoming" : today > w.end ? "completed" : "live";
    return {
      index,
      number: index + 1,
      ...w,
      status,
      provisional: status === "completed" && diffDays(w.end, today) <= settings.correctionDays,
      finalSprint: w.end >= sprintStart,
    };
  });
  const currentWeek =
    weeks.find((w) => w.status === "live") ?? (phase === "pre" ? weeks[0] : phase === "finished" ? weeks[weeks.length - 1] : null) ?? null;
  const completedWeeks = weeks.filter((w) => w.status === "completed");
  const lastCompletedWeek = completedWeeks[completedWeeks.length - 1] ?? null;

  // Every team total — fixtures, standings, cups, the sprint — stops at the last scored day,
  // so an early entry for today cannot count before the day it belongs to.
  const scored = (ds: ISODate[]) => ds.filter((d) => d <= lastCounted);
  const teamPointsIn = (teamId: string, ds: ISODate[]) => sum(scored(ds).map((d) => teamDay(teamId, d).earned));
  const teamStepsIn = (teamId: string, ds: ISODate[]) => sum(scored(ds).map((d) => teamDay(teamId, d).steps));

  // Fixtures
  const fixtures: FixtureResult[] = snap.fixtures
    .filter((f) => weeks[f.weekIndex] && teamIds.has(f.homeTeamId) && teamIds.has(f.awayTeamId))
    .sort((a, b) => a.weekIndex - b.weekIndex)
    .map((f) => {
      const week = weeks[f.weekIndex];
      const side = (teamId: string): FixtureSide => ({
        teamId,
        points: teamPointsIn(teamId, week.dates),
        possible: sum(scored(week.dates).map((d) => teamDay(teamId, d).possible)),
        steps: teamStepsIn(teamId, week.dates),
      });
      const home = side(f.homeTeamId);
      const away = side(f.awayTeamId);
      const leaderId = home.points > away.points ? home.teamId : away.points > home.points ? away.teamId : null;
      return {
        id: f.id,
        week,
        home,
        away,
        status: week.status,
        outcome: week.status === "completed" ? leaderId ?? "draw" : null,
        leaderId,
      };
    });

  // Standings
  const lp = settings.leaguePoints;
  const standingsAfter = (weekIndex: number): StandingRow[] => {
    const rows = new Map<string, StandingRow>(
      teams.map((t) => [t.id, { teamId: t.id, position: 0, played: 0, won: 0, drawn: 0, lost: 0, points: 0, activity: 0, steps: 0, form: [], movement: null }]),
    );
    for (const f of fixtures) {
      if (f.status !== "completed" || f.week.index > weekIndex) continue;
      for (const [me, them] of [[f.home, f.away], [f.away, f.home]] as const) {
        const r = rows.get(me.teamId)!;
        r.played++;
        if (me.points > them.points) { r.won++; r.points += lp.win; r.form.push("W"); }
        else if (me.points === them.points) { r.drawn++; r.points += lp.draw; r.form.push("D"); }
        else { r.lost++; r.points += lp.loss; r.form.push("L"); }
      }
    }
    const ds = weeks.filter((w) => w.index <= weekIndex && w.status === "completed").flatMap((w) => w.dates);
    for (const r of rows.values()) {
      r.activity = teamPointsIn(r.teamId, ds);
      r.steps = teamStepsIn(r.teamId, ds);
      r.form = r.form.slice(-5);
    }
    const key = (r: StandingRow) => [r.points, r.won, r.activity, r.steps];
    const cmp = (a: StandingRow, b: StandingRow) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
      return 0;
    };
    const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? "";
    const sorted = [...rows.values()].sort((a, b) => cmp(a, b) || nameOf(a.teamId).localeCompare(nameOf(b.teamId)));
    sorted.forEach((r, i) => { r.position = i > 0 && cmp(sorted[i - 1], r) === 0 ? sorted[i - 1].position : i + 1; });
    return sorted;
  };
  const standings = standingsAfter(lastCompletedWeek?.index ?? -1);
  if (lastCompletedWeek && lastCompletedWeek.index > 0) {
    const prev = standingsAfter(lastCompletedWeek.index - 1);
    for (const r of standings) {
      const p = prev.find((x) => x.teamId === r.teamId);
      r.movement = p ? p.position - r.position : null;
    }
  }

  // Trophy races
  const race = (key: string, label: string, raceDates: ISODate[]): TrophyRace => {
    const rStart = raceDates[0];
    const rEnd = raceDates[raceDates.length - 1];
    const status: RaceStatus = today < rStart ? "upcoming" : today > rEnd ? "completed" : "live";
    const totals = teams.map((t) => ({ teamId: t.id, points: teamPointsIn(t.id, raceDates) })).sort((a, b) => b.points - a.points);
    const winners = status === "completed" ? topBy(totals, (t) => t.points).map((t) => t.teamId) : [];
    return { key, label, start: rStart, end: rEnd, status, totals, winners };
  };
  const months = [...new Set(dates.map(monthKey))];
  const monthlyCups = months.map((m) => race(m, monthName(m), dates.filter((d) => monthKey(d) === m)));
  const finalSprint = race("final-sprint", "Final Sprint", dates.filter((d) => d >= sprintStart));
  const champion = phase === "finished" ? standings.filter((r) => r.position === 1).map((r) => r.teamId) : [];

  // Individual statistics
  const first7 = dates.slice(0, 7);
  const latest7 = countedDates.slice(-7);
  const improvementReady = countedDates.length >= 14;
  const prevWeek = currentWeek && currentWeek.index > 0 ? weeks[currentWeek.index - 1] : null;
  const avgRecorded = (userId: string, ds: ISODate[]) => {
    const vals = ds.map((d) => memberDay(userId, d).steps).filter((s): s is number => s !== null);
    return vals.length >= 3 ? sum(vals) / vals.length : null;
  };
  const stepsIn = (userId: string, ds: ISODate[]) => sum(ds.map((d) => memberDay(userId, d).steps ?? 0));

  const stats = new Map<string, MemberStats>();
  const badgeUnlocks: BadgeUnlock[] = [];
  for (const m of participants) {
    let total = 0, recorded = 0, consistency = 0, goal = 0, contributed = 0, contributionDays = 0;
    let streak = 0, best = 0;
    let firstDay: ISODate | null = null;
    const unlocked: Partial<Record<BadgeId, ISODate>> = {};
    const unlock = (id: BadgeId, d: ISODate) => { if (!unlocked[id]) unlocked[id] = d; };
    for (const d of countedDates) {
      const md = memberDay(m.id, d);
      if (md.leave) continue; // leave pauses a streak without breaking it
      if (md.steps === null) {
        if (d !== lastCounted) streak = 0; // the newest day may simply not have synced yet
        continue;
      }
      firstDay ??= d;
      recorded++;
      total += md.steps;
      contributed += md.points;
      if (md.points > 0) contributionDays++;
      if (md.steps >= activeSteps) { consistency++; streak++; } else streak = 0;
      if (md.steps >= GOAL_STEPS) goal++;
      best = Math.max(best, streak);
      unlock("first_steps", d);
      if (streak >= 5) unlock("streak_5", d);
      if (streak >= 10) unlock("streak_10", d);
      if (streak >= 25) unlock("streak_25", d);
      if (total >= 100_000) unlock("club_100k", d);
      if (total >= 250_000) unlock("club_250k", d);
      if (goal >= 10) unlock("goal_getter", d);
      if (contributionDays >= 20) unlock("team_contributor", d);
    }
    const progressOf: Record<BadgeId, number> = {
      first_steps: recorded > 0 ? 1 : 0,
      streak_5: best,
      streak_10: best,
      streak_25: best,
      club_100k: total,
      club_250k: total,
      goal_getter: goal,
      team_contributor: contributionDays,
    };
    const badges: BadgeStatus[] = BADGES.map((b) => ({
      id: b.id,
      unlockedOn: unlocked[b.id] ?? null,
      progress: Math.min(progressOf[b.id], b.target),
      target: b.target,
    }));
    for (const b of badges) if (b.unlockedOn) badgeUnlocks.push({ userId: m.id, badgeId: b.id, date: b.unlockedOn });

    const first7Avg = improvementReady ? avgRecorded(m.id, first7) : null;
    const latest7Avg = improvementReady ? avgRecorded(m.id, latest7) : null;
    const weekDates = currentWeek ? currentWeek.dates.filter((d) => d <= lastCounted) : [];
    stats.set(m.id, {
      userId: m.id,
      teamId: m.teamId!,
      totalSteps: total,
      daysRecorded: recorded,
      avgSteps: recorded ? total / recorded : null,
      consistencyDays: consistency,
      goalDays: goal,
      pointsContributed: contributed,
      contributionDays,
      currentStreak: streak,
      bestStreak: best,
      first7Avg,
      latest7Avg,
      improvementPct: first7Avg && latest7Avg !== null ? ((latest7Avg - first7Avg) / first7Avg) * 100 : null,
      thisWeekSteps: stepsIn(m.id, weekDates),
      thisWeekActiveDays: weekDates.filter((d) => (memberDay(m.id, d).steps ?? 0) >= activeSteps).length,
      lastWeekSteps: prevWeek ? stepsIn(m.id, prevWeek.dates) : 0,
      badges,
      latest: memberDay(m.id, lastCounted),
    });
    void firstDay;
  }
  badgeUnlocks.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // Leaderboards
  const statList = [...stats.values()];
  const totalsOf = (s: MemberStats): PlayerTotals => ({ points: s.pointsContributed, steps: s.totalSteps, avg: s.avgSteps });
  // Where each player stood last Sunday, on both orderings, so a board can show movement.
  const prevTotalRank = new Map<string, number>();
  const prevPointsRank = new Map<string, number>();
  if (prevWeek) {
    const upTo = prevWeek.end;
    const upToDates = countedDates.filter((d) => d <= upTo);
    const prevTotals = participants.map((m) => ({ id: m.id, v: stepsIn(m.id, upToDates) }));
    for (const { item, rank } of rankBy(prevTotals, (x) => x.v)) prevTotalRank.set(item.id, rank);
    const prevPoints = participants.map((m) => {
      const days = upToDates.map((d) => memberDay(m.id, d)).filter((x) => !x.leave && x.steps !== null);
      const steps = sum(days.map((x) => x.steps ?? 0));
      return { id: m.id, points: sum(days.map((x) => x.points)), steps, avg: days.length ? steps / days.length : null };
    });
    for (const { item, rank } of rankWith(prevPoints, byPlayerTotals)) prevPointsRank.set(item.id, rank);
  }
  const board = (list: MemberStats[], value: (s: MemberStats) => number, change: (s: MemberStats, rank: number) => number | null): LeaderRow[] =>
    rankBy(list, value).map(({ item, rank }) => ({ userId: item.userId, rank, value: value(item), change: change(item, rank) }));
  const leaderboards = {
    points: rankWith(statList, (a, b) => byPlayerTotals(totalsOf(a), totalsOf(b))).map(({ item, rank }) => ({
      userId: item.userId,
      rank,
      value: item.pointsContributed,
      change: prevPointsRank.has(item.userId) ? prevPointsRank.get(item.userId)! - rank : null,
    })),
    total: board(statList, (s) => s.totalSteps, (s, rank) => (prevTotalRank.has(s.userId) ? prevTotalRank.get(s.userId)! - rank : null)),
    consistency: board(statList, (s) => s.consistencyDays, (s) => s.thisWeekActiveDays),
    improved: board(statList.filter((s) => s.improvementPct !== null), (s) => s.improvementPct!, () => null),
    week: board(statList, (s) => s.thisWeekSteps, (s) => (prevWeek ? s.thisWeekSteps - s.lastWeekSteps : null)),
  };

  // Two honours worth calling out by name: yesterday's biggest walk and the season's biggest
  // total. A tie shares the honour; an empty field (nothing walked) awards nothing.
  const leadersBy = (value: (s: MemberStats) => number) => topBy(statList, value).map((s) => s.userId);
  const stepLeaders: StepLeaders = {
    yesterday: leadersBy((s) => s.latest.steps ?? 0),
    total: leadersBy((s) => s.totalSteps),
  };

  // Weekly awards (final after Sunday; the live week shows the race so far)
  const weeklyAwards: WeeklyAwards[] = weeks
    .filter((w) => w.status !== "upcoming")
    .map((w) => {
      const ds = w.dates.filter((d) => d <= lastCounted);
      const rows = participants.map((m) => {
        const days = ds.map((d) => memberDay(m.id, d));
        return {
          m,
          steps: sum(days.map((d) => d.steps ?? 0)),
          active: days.filter((d) => (d.steps ?? 0) >= activeSteps).length,
          points: sum(days.map((d) => d.points)),
        };
      });
      const mvp = topBy(rows, (r) => r.steps).map((r) => ({ userId: r.m.id, value: r.steps, detail: `${fmtNum(r.steps)} steps` }));
      const consistency = topBy(rows, (r) => r.active).map((r) => ({ userId: r.m.id, value: r.active, detail: `${r.active} of ${ds.length} days at ${fmtNum(activeSteps)}+` }));
      let comeback: AwardWinner[] = [];
      const prev = weeks[w.index - 1];
      if (prev) {
        const deltas = participants
          .map((m) => {
            const a = avgRecorded(m.id, prev.dates);
            const b = avgRecorded(m.id, ds);
            return { m, delta: a !== null && b !== null ? b - a : 0 };
          });
        comeback = topBy(deltas, (r) => Math.round(r.delta)).map((r) => ({ userId: r.m.id, value: Math.round(r.delta), detail: `+${fmtNum(r.delta)} steps a day vs last week` }));
      }
      const teamRates = teams.map((t) => {
        let active = 0, possible = 0;
        for (const d of ds) for (const m of rosterOn(t.id, d)) {
          const md = memberDay(m.id, d);
          if (md.leave) continue;
          possible++;
          if ((md.steps ?? 0) >= activeSteps) active++;
        }
        return { t, rate: possible ? Math.round((active / possible) * 1000) / 10 : 0 };
      });
      const bestTeams = topBy(teamRates, (r) => r.rate);
      const teamPlayer = bestTeams.flatMap(({ t, rate }) =>
        topBy(
          participants.map((m) => ({ m, points: sum(ds.filter((d) => teamOf(m.id, d) === t.id).map((d) => memberDay(m.id, d).points)) })),
          (r) => r.points,
        ).map((r) => ({
          userId: r.m.id,
          value: r.points,
          detail: `${r.points} team points · ${t.name} ${rate}% active`,
        })),
      );
      return { weekIndex: w.index, final: w.status === "completed", mvp, consistency, comeback, teamPlayer };
    });

  // Weekly challenges
  const challengeByWeek = new Map<number, Challenge>(snap.challenges.map((c) => [c.weekIndex, c]));
  const challenges: WeekChallenge[] = weeks.flatMap((w) => {
    const c = challengeByWeek.get(w.index);
    if (!c) return [];
    const ds = w.dates.filter((d) => d <= lastCounted);
    const progress = participants.map((m) => {
      const days = ds.map((d) => memberDay(m.id, d));
      let current = 0, target = 1;
      switch (c.type) {
        case "five_day_move":
          target = Math.min(5, w.dates.length);
          current = days.filter((d) => (d.steps ?? 0) >= 5000).length;
          break;
        case "weekend_walk":
          current = ds.some((d, i) => weekday(d) >= 5 && (days[i].steps ?? 0) >= 8000) ? 1 : 0;
          break;
        case "streak_builder":
          target = w.dates.length;
          current = days.filter((d) => d.leave || d.steps !== null).length;
          break;
        case "ten_k_day":
          current = days.some((d) => (d.steps ?? 0) >= 10_000) ? 1 : 0;
          break;
      }
      return { userId: m.id, current: Math.min(current, target), target, completed: current >= target };
    });
    return [{ weekIndex: w.index, type: c.type, ...CHALLENGE_TYPES[c.type], progress }];
  });

  return {
    settings,
    today,
    lastCounted,
    phase,
    start,
    end,
    dayNumber,
    daysRemaining,
    dates,
    countedDates,
    maxDaily,
    activeSteps,
    teams,
    participants,
    membersByTeam,
    memberships,
    teamOf,
    rosterOn,
    memberDay,
    teamDay,
    weeks,
    currentWeek,
    lastCompletedWeek,
    fixtures,
    standings,
    standingsAfter,
    monthlyCups,
    finalSprint,
    champion,
    stats,
    leaderboards,
    stepLeaders,
    weeklyAwards,
    challenges,
    badgeUnlocks,
  };
}

// ───────────────────────── Insights & recap ─────────────────────────

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const word = (n: number) => WORDS[n] ?? String(n);

/** One short, encouraging "What matters today" line. */
export function todayInsight(s: Season): string {
  const teamName = (id: string) => s.teams.find((t) => t.id === id)?.name ?? "A team";
  if (s.phase === "pre") return `The season starts ${formatRange(s.start, s.start)}. Every day you record earns your team a point, and the steps decide how many more.`;
  if (s.phase === "finished") return "The season is complete. Thank you for every step.";

  // 1. A close live fixture
  const live = s.fixtures.filter((f) => f.status === "live");
  const close = live
    .map((f) => ({ f, gap: Math.abs(f.home.points - f.away.points) }))
    .filter((x) => x.gap <= 6)
    .sort((a, b) => a.gap - b.gap)[0];
  if (close) {
    const { f, gap } = close;
    if (gap === 0 && f.home.points > 0) return `${teamName(f.home.teamId)} and ${teamName(f.away.teamId)} are level this week. One point today changes the lead.`;
    if (gap > 0) {
      const trailing = f.leaderId === f.home.teamId ? f.away : f.home;
      return `${teamName(trailing.teamId)} need ${gap + 1} more point${gap + 1 === 1 ? "" : "s"} to take the lead against ${teamName(f.leaderId!)} this week.`;
    }
  }

  // 2. Members who just missed the next band
  const nearByTeam = new Map<string, number>();
  for (const m of s.participants) {
    const d = s.memberDay(m.id, s.lastCounted);
    if (d.steps === null) continue;
    const nb = nextBand(d.steps, s.settings.bands);
    if (nb && nb.gap <= 1000) nearByTeam.set(m.teamId!, (nearByTeam.get(m.teamId!) ?? 0) + 1);
  }
  const bestNear = [...nearByTeam.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bestNear) {
    const [teamId, n] = bestNear;
    return `${word(n)} ${teamName(teamId)} member${n === 1 ? " is" : "s are"} finishing within 1,000 steps of the next point band. Today is the day to close it.`;
  }

  // 3. Streaks about to land
  const almost = [...s.stats.values()].filter((st) => [4, 9, 24].includes(st.currentStreak));
  if (almost.length > 0) {
    const n = almost.length;
    return `${word(n)} ${n === 1 ? "person is" : "people are"} one day away from a new streak badge.`;
  }

  const sorted = sortedBands(s.settings.bands);
  const base = sorted[0].points;
  const top = sorted[sorted.length - 1];
  const opener =
    base > 0
      ? `Every day you record earns your team ${base === 1 ? "a point" : `${word(base).toLowerCase()} points`}`
      : `Every day at ${fmtNum(s.activeSteps)}+ steps earns a point`;
  return `${opener}, and ${fmtNum(top.min)} steps earns the full ${word(top.points).toLowerCase()}.`;
}

/** Plain-text weekly recap for pasting into an office chat. */
export function weeklyRecap(s: Season, weekIndex: number, nameOf: (userId: string) => string): string {
  const week = s.weeks[weekIndex];
  if (!week) return "No week to recap yet.";
  const teamName = (id: string) => s.teams.find((t) => t.id === id)?.name ?? "?";
  const lines: string[] = [];
  lines.push(`${s.settings.seasonName}: Week ${week.number} recap (${formatRange(week.start, week.end)})`);
  lines.push("");
  lines.push("Results");
  for (const f of s.fixtures.filter((x) => x.week.index === weekIndex)) {
    const tag = f.outcome === "draw" ? " (draw)" : f.outcome ? ` (${teamName(f.outcome)} win)` : " (in progress)";
    lines.push(`• ${teamName(f.home.teamId)} ${f.home.points} – ${f.away.points} ${teamName(f.away.teamId)}${tag}`);
  }
  lines.push("");
  lines.push("Table");
  const table = s.standingsAfter(weekIndex);
  for (const r of table) lines.push(`${r.position}. ${teamName(r.teamId)}: ${r.points} ${r.points === 1 ? "pt" : "pts"} (W${r.won} D${r.drawn} L${r.lost})`);
  const awards = s.weeklyAwards.find((a) => a.weekIndex === weekIndex);
  if (awards) {
    lines.push("");
    lines.push("Awards");
    const fmt = (label: string, ws: AwardWinner[]) => {
      if (!ws.length) return;
      const sameDetail = ws.every((w) => w.detail === ws[0].detail);
      if (!sameDetail) {
        lines.push(`• ${label}: ${ws.map((w) => `${nameOf(w.userId)} (${w.detail})`).join(", ")}`);
        return;
      }
      const names = ws.map((w) => nameOf(w.userId));
      const who = names.length <= 4 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} others`;
      lines.push(`• ${label}: ${who} (${ws[0].detail})`);
    };
    fmt("Weekly MVP", awards.mvp);
    fmt("Consistency Star", awards.consistency);
    fmt("Comeback Walker", awards.comeback);
    fmt("Team Player", awards.teamPlayer);
  }
  const totalSteps = sum(s.participants.flatMap((m) => week.dates.map((d) => s.memberDay(m.id, d).steps ?? 0)));
  const km = Math.round((totalSteps * 0.75) / 1000);
  lines.push("");
  lines.push(`Stat of the week: together we walked ${fmtNum(totalSteps)} steps, about ${fmtNum(km)} km.`);
  const next = s.weeks[weekIndex + 1];
  if (next) {
    const nf = s.fixtures.filter((x) => x.week.index === next.index);
    if (nf.length) lines.push(`Next up: ${nf.map((f) => `${teamName(f.home.teamId)} v ${teamName(f.away.teamId)}`).join(" · ")}`);
  }
  return lines.join("\n");
}
