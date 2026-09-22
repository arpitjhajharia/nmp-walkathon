// Database reads and the results writer. Takes an explicit Supabase client and has no
// Next.js imports, so the setup scripts can use it too.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidISODate, nowInTz, type ISODate } from "../engine/dates.ts";
import { DEFAULT_SETTINGS } from "../engine/defaults.ts";
import { computeSeason, type Season } from "../engine/engine.ts";
import type { ChallengeType, Membership, Settings, Snapshot, Team } from "../engine/types.ts";

/** A person in the competition. Emails aren't public; admins load them with loadContacts. */
export interface UserRecord {
  id: string;
  name: string;
  isAdmin: boolean;
  active: boolean;
  teamId: string | null;
}

export interface Contact {
  id: string;
  email: string;
  authUserId: string | null;
}

export interface SeasonRow {
  id: string;
  name: string;
  start_date: string;
  length_days: number;
  timezone: string;
  rules: Partial<Settings>;
}

export interface EntryMeta {
  updatedBy: string | null;
  updatedAt: string;
}

export interface LoadedData {
  season: SeasonRow;
  snapshot: Snapshot;
  users: UserRecord[];
  entryMeta: Map<string, EntryMeta>;
}

type Result<T> = { data: T | null; error: { message: string } | null };

/** Throw on a Supabase error, otherwise return the data. */
export function must<T>(res: Result<T>, what = "Database request"): T {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  return res.data as T;
}

/** Page through a query (Supabase returns at most 1,000 rows per request). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Result<T[]>>, what?: string): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const rows = must(await page(from, from + size - 1), what);
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

export function todayFor(timezone: string): ISODate {
  return nowInTz(timezone).date;
}

export async function activeSeason(db: SupabaseClient): Promise<SeasonRow | null> {
  const res = await db.from("seasons").select("id, name, start_date, length_days, timezone, rules").eq("is_active", true).maybeSingle();
  return must(res, "Loading the season") as SeasonRow | null;
}

export function settingsOf(row: SeasonRow): Settings {
  const r = row.rules ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    seasonName: row.name,
    startDate: row.start_date,
    lengthDays: row.length_days,
    timezone: row.timezone,
  };
}

interface TeamRow {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
  lead_user_id: string | null;
}

export async function loadTeams(db: SupabaseClient, seasonId: string): Promise<Team[]> {
  const rows = must(
    await db.from("teams").select("id, slug, name, color, icon, lead_user_id").eq("season_id", seasonId).order("sort_order").order("name"),
    "Loading teams",
  ) as TeamRow[];
  return rows.map((t) => ({ id: t.id, slug: t.slug, name: t.name, color: t.color, icon: t.icon, leadUserId: t.lead_user_id }));
}

export async function loadUsers(db: SupabaseClient, seasonId: string): Promise<UserRecord[]> {
  const [profiles, members] = await Promise.all([
    fetchAll<{ id: string; name: string; is_admin: boolean; active: boolean }>(
      (a, b) => db.from("profiles").select("id, name, is_admin, active").order("name").range(a, b),
      "Loading people",
    ),
    fetchAll<{ user_id: string; team_id: string }>((a, b) => db.from("team_members").select("user_id, team_id").eq("season_id", seasonId).order("user_id").range(a, b)),
  ]);
  const teamOf = new Map(members.map((m) => [m.user_id, m.team_id]));
  return profiles.map((p) => ({ id: p.id, name: p.name, isAdmin: p.is_admin, active: p.active, teamId: teamOf.get(p.id) ?? null }));
}

/** Emails and sign-in links. The database returns these only to admins. */
export async function loadContacts(db: SupabaseClient): Promise<Map<string, Contact>> {
  const rows = must(await db.rpc("member_contacts"), "Loading contacts") as { id: string; email: string; auth_user_id: string | null }[];
  return new Map(rows.map((r) => [r.id, { id: r.id, email: r.email, authUserId: r.auth_user_id }]));
}

export async function loadData(db: SupabaseClient, season: SeasonRow): Promise<LoadedData> {
  const sid = season.id;
  const [teams, users, entries, leaves, fixtures, challenges, memberships] = await Promise.all([
    loadTeams(db, sid),
    loadUsers(db, sid),
    fetchAll<{ user_id: string; date: string; steps: number; updated_by: string | null; updated_at: string }>(
      (a, b) => db.from("step_entries").select("user_id, date, steps, updated_by, updated_at").eq("season_id", sid).order("date").order("user_id").range(a, b),
      "Loading steps",
    ),
    fetchAll<{ user_id: string; date: string }>((a, b) => db.from("leave_records").select("user_id, date").eq("season_id", sid).order("date").order("user_id").range(a, b)),
    fetchAll<{ id: string; week_index: number; home_team_id: string; away_team_id: string }>(
      (a, b) => db.from("fixtures").select("id, week_index, home_team_id, away_team_id").eq("season_id", sid).order("week_index").order("id").range(a, b),
    ),
    fetchAll<{ week_index: number; type: ChallengeType }>((a, b) => db.from("weekly_challenges").select("week_index, type").eq("season_id", sid).order("week_index").range(a, b)),
    fetchAll<{ user_id: string; team_id: string; from_date: string; to_date: string | null }>(
      (a, b) => db.from("membership_history").select("user_id, team_id, from_date, to_date").eq("season_id", sid).order("from_date").order("user_id").range(a, b),
    ),
  ]);
  const entryMeta = new Map<string, EntryMeta>();
  for (const e of entries) entryMeta.set(`${e.user_id}|${e.date}`, { updatedBy: e.updated_by, updatedAt: e.updated_at });
  return {
    season,
    users,
    entryMeta,
    snapshot: {
      settings: settingsOf(season),
      teams,
      members: users,
      entries: entries.map((e) => ({ userId: e.user_id, date: e.date, steps: e.steps })),
      leaves: leaves.map((l) => ({ userId: l.user_id, date: l.date })),
      fixtures: fixtures.map((f) => ({ id: f.id, weekIndex: f.week_index, homeTeamId: f.home_team_id, awayTeamId: f.away_team_id })),
      challenges: challenges.map((c) => ({ weekIndex: c.week_index, type: c.type })),
      memberships: memberships.map((m): Membership => ({ userId: m.user_id, teamId: m.team_id, from: m.from_date, to: m.to_date })),
    },
  };
}

export function compute(data: LoadedData): Season {
  return computeSeason(data.snapshot, todayFor(data.season.timezone));
}

/** Write fixture results, standings, awards, cups and badges. Needs the service-role client. */
export async function materialize(admin: SupabaseClient, seasonId: string, s: Season): Promise<void> {
  const fixtureIds = s.fixtures.map((f) => f.id);
  if (fixtureIds.length) must(await admin.from("fixture_results").delete().in("fixture_id", fixtureIds), "Clearing results");
  for (const table of ["league_standings", "weekly_awards", "monthly_cups", "user_badges"]) {
    must(await admin.from(table).delete().eq("season_id", seasonId), `Clearing ${table}`);
  }
  const now = new Date().toISOString();
  const inserts: [string, Record<string, unknown>[]][] = [
    ["fixture_results", s.fixtures.map((f) => ({ fixture_id: f.id, home_points: f.home.points, away_points: f.away.points, outcome: f.outcome, status: f.status, computed_at: now }))],
    [
      "league_standings",
      s.standings.map((r) => ({ season_id: seasonId, team_id: r.teamId, position: r.position, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, points: r.points, activity: r.activity, steps: r.steps })),
    ],
    [
      "weekly_awards",
      s.weeklyAwards.flatMap((a) =>
        (
          [
            ["mvp", a.mvp],
            ["consistency", a.consistency],
            ["comeback", a.comeback],
            ["team_player", a.teamPlayer],
          ] as const
        ).flatMap(([award, ws]) => ws.map((w) => ({ season_id: seasonId, week_index: a.weekIndex, award, user_id: w.userId, detail: w.detail, final: a.final }))),
      ),
    ],
    [
      "monthly_cups",
      s.monthlyCups.flatMap((c) => c.totals.map((t) => ({ season_id: seasonId, month: c.key, team_id: t.teamId, points: t.points, status: c.status, winner: c.winners.includes(t.teamId) }))),
    ],
    ["user_badges", s.badgeUnlocks.map((b) => ({ season_id: seasonId, user_id: b.userId, badge_id: b.badgeId, unlocked_on: b.date }))],
  ];
  for (const [table, rows] of inserts) {
    for (let i = 0; i < rows.length; i += 500) must(await admin.from(table).insert(rows.slice(i, i + 500)), `Writing ${table}`);
  }
}

/** Recompute everything from raw data and store the results (service-role client). */
export async function recomputeWith(admin: SupabaseClient): Promise<Season | null> {
  const season = await activeSeason(admin);
  if (!season) return null;
  const s = compute(await loadData(admin, season));
  await materialize(admin, season.id, s);
  return s;
}

export function validDate(d: unknown): d is ISODate {
  return typeof d === "string" && isValidISODate(d);
}
