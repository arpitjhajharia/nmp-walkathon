// Data access and mutations. Every write is audited and followed by a recompute that
// refreshes the materialised result tables. Pages read computed results via season.ts.

import { randomBytes, randomUUID } from "node:crypto";
import { addDays, diffDays, isValidISODate, mondayOf, nowInTz, type ISODate } from "../engine/dates.ts";
import { DEFAULT_SETTINGS } from "../engine/defaults.ts";
import { DEMO_PASSWORD, buildDemoData } from "../engine/demo.ts";
import { BADGES, computeSeason, generateFixtures, pointsFor, seasonWeeks, type Season } from "../engine/engine.ts";
import type { ChallengeType, Membership, Settings, Snapshot, Team } from "../engine/types.ts";
import { all, get, isDemoMode, run, tx } from "./db.ts";
import { hashPassword } from "./passwords.ts";

// ───────────────────────── Types ─────────────────────────

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  active: boolean;
  teamId: string | null;
}

export interface SessionUser extends UserRecord {
  leadTeamId: string | null;
}

interface SeasonRow {
  id: string;
  name: string;
  start_date: string;
  length_days: number;
  timezone: string;
  rules_json: string;
}

type Rules = Pick<Settings, "bands" | "leaguePoints" | "correctionDays" | "teamSize" | "finalSprintDays" | "lockOlderDates" | "highValueWarning">;

const g = globalThis as unknown as { __walkathonBoot?: boolean };

// ───────────────────────── Bootstrap ─────────────────────────

export function todayFor(timezone: string): ISODate {
  const override = process.env.WALKATHON_TODAY;
  if (override && isValidISODate(override)) return override;
  return nowInTz(timezone).date;
}

function ensureBootstrapped(): void {
  if (g.__walkathonBoot) return;
  for (const b of BADGES) {
    run(
      "INSERT INTO badge_definitions (id, name, description, target) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, target = excluded.target",
      b.id, b.name, b.description, b.target,
    );
  }
  if (!get("SELECT id FROM seasons WHERE is_active = 1")) {
    if (isDemoMode()) seedDemo();
    else seedFresh();
  }
  backfillMemberships();
  g.__walkathonBoot = true;
}

/** Databases created before team history existed: start everyone's current team on day one. */
function backfillMemberships(): void {
  const season = get<{ id: string; start_date: string }>("SELECT id, start_date FROM seasons WHERE is_active = 1");
  if (!season || get("SELECT 1 FROM membership_history WHERE season_id = ? LIMIT 1", season.id)) return;
  run(
    `INSERT INTO membership_history (season_id, user_id, team_id, from_date, to_date)
     SELECT tm.season_id, tm.user_id, tm.team_id, ?, NULL FROM team_members tm JOIN users u ON u.id = tm.user_id
     WHERE tm.season_id = ? AND u.active = 1`,
    season.start_date, season.id,
  );
}

/**
 * Change a member's team from `effective` onwards (null = leaves all teams). Days before
 * `effective` keep their old team, so past points stay where they were earned.
 */
function changeMembership(sid: string, userId: string, teamId: string | null, effective: ISODate): void {
  run("DELETE FROM membership_history WHERE season_id = ? AND user_id = ? AND from_date >= ?", sid, userId, effective);
  run(
    "UPDATE membership_history SET to_date = ? WHERE season_id = ? AND user_id = ? AND (to_date IS NULL OR to_date >= ?)",
    addDays(effective, -1), sid, userId, effective,
  );
  if (teamId) run("INSERT INTO membership_history (season_id, user_id, team_id, from_date, to_date) VALUES (?, ?, ?, ?, NULL)", sid, userId, teamId, effective);
}

/** First day a membership change takes effect: today, or the season start if it hasn't begun. */
function effectiveDate(): ISODate {
  const s = getSettings();
  const today = todayFor(s.timezone);
  return today > s.startDate ? today : s.startDate;
}

/** Team a member was on for a date, from team history. */
function teamOnDate(userId: string, date: ISODate): string | null {
  return (
    get<{ team_id: string }>(
      "SELECT team_id FROM membership_history WHERE season_id = ? AND user_id = ? AND from_date <= ? AND (to_date IS NULL OR to_date >= ?)",
      seasonId(), userId, date, date,
    )?.team_id ?? null
  );
}

function rulesOf(s: Settings): Rules {
  return {
    bands: s.bands,
    leaguePoints: s.leaguePoints,
    correctionDays: s.correctionDays,
    teamSize: s.teamSize,
    finalSprintDays: s.finalSprintDays,
    lockOlderDates: s.lockOlderDates,
    highValueWarning: s.highValueWarning,
  };
}

function clearAll(): void {
  for (const t of [
    "audit_log", "user_badges", "monthly_cups", "weekly_awards", "league_standings", "fixture_results",
    "correction_requests", "unlocked_dates", "weekly_challenges", "fixtures", "leave_records", "step_entries", "membership_history",
    "team_members", "teams", "seasons", "sessions", "users",
  ]) run(`DELETE FROM ${t}`);
}

function insertSeason(settings: Settings): string {
  const id = `season-${randomBytes(4).toString("hex")}`;
  run(
    "INSERT INTO seasons (id, name, start_date, length_days, timezone, rules_json, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
    id, settings.seasonName, settings.startDate, settings.lengthDays, settings.timezone, JSON.stringify(rulesOf(settings)),
  );
  return id;
}

export function seedDemo(): void {
  const demo = buildDemoData(todayFor(DEFAULT_SETTINGS.timezone));
  const hash = hashPassword(DEMO_PASSWORD);
  tx(() => {
    clearAll();
    const seasonId = insertSeason(demo.settings);
    for (const m of demo.members) {
      run("INSERT INTO users (id, name, email, password_hash, is_admin) VALUES (?, ?, ?, ?, ?)", m.id, m.name, m.email, hash, m.isAdmin ? 1 : 0);
    }
    demo.teams.forEach((t, i) => {
      const lead = demo.members.find((m) => m.teamId === t.id && m.isLead);
      run(
        "INSERT INTO teams (id, season_id, slug, name, color, icon, lead_user_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        t.id, seasonId, t.slug, t.name, t.color, t.icon, lead?.id ?? null, i,
      );
    });
    for (const m of demo.members) {
      if (!m.teamId) continue;
      run("INSERT INTO team_members (season_id, user_id, team_id) VALUES (?, ?, ?)", seasonId, m.id, m.teamId);
      run("INSERT INTO membership_history (season_id, user_id, team_id, from_date) VALUES (?, ?, ?, ?)", seasonId, m.id, m.teamId, demo.settings.startDate);
    }
    const insEntry = "INSERT INTO step_entries (season_id, user_id, date, steps, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)";
    for (const e of demo.entries) {
      const lead = demo.members.find((m) => m.isLead && m.teamId === demo.members.find((x) => x.id === e.userId)?.teamId);
      run(insEntry, seasonId, e.userId, e.date, e.steps, lead?.id ?? null, `${e.date} 20:30:00`);
    }
    for (const l of demo.leaves) run("INSERT INTO leave_records (season_id, user_id, date, created_by) VALUES (?, ?, ?, NULL)", seasonId, l.userId, l.date);
    writeFixtures(seasonId, demo.settings, demo.teams.map((t) => t.id));
    for (const c of demo.challenges) run("INSERT OR REPLACE INTO weekly_challenges (season_id, week_index, type) VALUES (?, ?, ?)", seasonId, c.weekIndex, c.type);
    audit(null, "reset", "demo", seasonId, null, null, "Demo data seeded");
  });
  recompute();
}

function seedFresh(): void {
  const tz = DEFAULT_SETTINGS.timezone;
  const nextMonday = mondayOf(addDays(todayFor(tz), 7));
  const settings: Settings = { ...DEFAULT_SETTINGS, startDate: nextMonday };
  tx(() => {
    const seasonId = insertSeason(settings);
    const defaults = [
      ["Comets", "#1D4ED8", "rocket"],
      ["Striders", "#15803D", "footprints"],
      ["Blazers", "#C2410C", "flame"],
      ["Nomads", "#7E22CE", "compass"],
    ];
    defaults.forEach(([name, color, icon], i) =>
      run("INSERT INTO teams (id, season_id, slug, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)", `team-${randomBytes(3).toString("hex")}`, seasonId, name.toLowerCase(), name, color, icon, i),
    );
    writeFixtures(seasonId, settings, teamRows(seasonId).map((t) => t.id));
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      run("INSERT INTO users (id, name, email, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)", `user-${randomUUID()}`, process.env.ADMIN_NAME || "Walkathon Admin", email, hashPassword(password));
    }
  });
}

// ───────────────────────── Reads ─────────────────────────

function seasonRow(): SeasonRow {
  ensureBootstrapped();
  const row = get<SeasonRow>("SELECT * FROM seasons WHERE is_active = 1");
  if (!row) throw new Error("No active season");
  return row;
}

export function seasonId(): string {
  return seasonRow().id;
}

export function getSettings(): Settings {
  const row = seasonRow();
  const rules = { ...rulesOf({ ...DEFAULT_SETTINGS, startDate: row.start_date }), ...(JSON.parse(row.rules_json) as Partial<Rules>) };
  return { seasonName: row.name, startDate: row.start_date, lengthDays: row.length_days, timezone: row.timezone, ...rules };
}

interface TeamRow {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
  lead_user_id: string | null;
}

function teamRows(sid: string): TeamRow[] {
  return all<TeamRow>("SELECT id, slug, name, color, icon, lead_user_id FROM teams WHERE season_id = ? ORDER BY sort_order, name", sid);
}

export function listTeams(): Team[] {
  return teamRows(seasonId()).map((t) => ({ id: t.id, slug: t.slug, name: t.name, color: t.color, icon: t.icon, leadUserId: t.lead_user_id }));
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  is_admin: number;
  active: number;
  team_id: string | null;
}

const USER_SELECT = `SELECT u.id, u.name, u.email, u.is_admin, u.active, tm.team_id
  FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.season_id = ?`;

function toUser(r: UserRow): UserRecord {
  return { id: r.id, name: r.name, email: r.email, isAdmin: r.is_admin === 1, active: r.active === 1, teamId: r.team_id };
}

export function listUsers(): UserRecord[] {
  return all<UserRow>(`${USER_SELECT} ORDER BY u.name`, seasonId()).map(toUser);
}

export function findUser(id: string): UserRecord | null {
  const r = get<UserRow>(`${USER_SELECT} WHERE u.id = ?`, seasonId(), id);
  return r ? toUser(r) : null;
}

export function findUserByEmail(email: string): (UserRecord & { passwordHash: string | null }) | null {
  const r = get<UserRow & { password_hash: string | null }>(
    `SELECT u.id, u.name, u.email, u.is_admin, u.active, u.password_hash, tm.team_id FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.season_id = ? WHERE u.email = ? COLLATE NOCASE`,
    seasonId(), email.trim(),
  );
  return r ? { ...toUser(r), passwordHash: r.password_hash } : null;
}

export function leadTeamOf(userId: string): string | null {
  return get<{ id: string }>("SELECT id FROM teams WHERE season_id = ? AND lead_user_id = ?", seasonId(), userId)?.id ?? null;
}

export function loadSnapshot(): Snapshot {
  const sid = seasonId();
  return {
    settings: getSettings(),
    teams: listTeams(),
    members: listUsers(),
    entries: all<{ userId: string; date: string; steps: number }>("SELECT user_id AS userId, date, steps FROM step_entries WHERE season_id = ?", sid),
    leaves: all<{ userId: string; date: string }>("SELECT user_id AS userId, date FROM leave_records WHERE season_id = ?", sid),
    fixtures: all<{ id: string; weekIndex: number; homeTeamId: string; awayTeamId: string }>(
      "SELECT id, week_index AS weekIndex, home_team_id AS homeTeamId, away_team_id AS awayTeamId FROM fixtures WHERE season_id = ? ORDER BY week_index, id",
      sid,
    ),
    challenges: all<{ weekIndex: number; type: ChallengeType }>("SELECT week_index AS weekIndex, type FROM weekly_challenges WHERE season_id = ?", sid),
    memberships: all<Membership>(
      "SELECT user_id AS userId, team_id AS teamId, from_date AS \"from\", to_date AS \"to\" FROM membership_history WHERE season_id = ? ORDER BY from_date",
      sid,
    ),
  };
}

export function computeCurrent(): Season {
  const snap = loadSnapshot();
  return computeSeason(snap, todayFor(snap.settings.timezone));
}

export interface EntryMeta {
  userId: string;
  steps: number;
  updatedBy: string | null;
  updatedAt: string;
}

export function entriesForDate(date: ISODate): EntryMeta[] {
  return all<EntryMeta>(
    "SELECT user_id AS userId, steps, updated_by AS updatedBy, updated_at AS updatedAt FROM step_entries WHERE season_id = ? AND date = ?",
    seasonId(), date,
  );
}

// ───────────────────────── Sessions ─────────────────────────

export function createSession(userId: string): { token: string; expires: Date } {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 86_400_000);
  run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", token, userId, expires.toISOString());
  return { token, expires };
}

export function userForSession(token: string): SessionUser | null {
  const row = get<{ user_id: string }>("SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?", token, new Date().toISOString());
  if (!row) return null;
  const user = findUser(row.user_id);
  if (!user || !user.active) return null;
  return { ...user, leadTeamId: leadTeamOf(user.id) };
}

export function deleteSession(token: string): void {
  run("DELETE FROM sessions WHERE token = ?", token);
}

// ───────────────────────── Audit ─────────────────────────

export function audit(actorId: string | null, action: string, entity: string, key: string, before: unknown, after: unknown, note?: string): void {
  run(
    "INSERT INTO audit_log (actor_id, action, entity, entity_key, before_json, after_json, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
    actorId, action, entity, key,
    before === null || before === undefined ? null : JSON.stringify(before),
    after === null || after === undefined ? null : JSON.stringify(after),
    note ?? null,
  );
}

export interface AuditRow {
  id: number;
  at: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityKey: string;
  before: string | null;
  after: string | null;
  note: string | null;
}

export function auditLog(limit = 200, entity?: string): AuditRow[] {
  const where = entity ? "WHERE entity = ?" : "";
  const params = entity ? [entity, limit] : [limit];
  return all<AuditRow>(
    `SELECT id, at, actor_id AS actorId, action, entity, entity_key AS entityKey, before_json AS before, after_json AS after, note FROM audit_log ${where} ORDER BY id DESC LIMIT ?`,
    ...params,
  );
}

// ───────────────────────── Edit permissions ─────────────────────────

export interface EditPermission {
  editable: boolean;
  reason: string;
  unlockedByAdmin: boolean;
  canRequest: boolean;
}

export function editPermission(user: SessionUser, teamId: string, date: ISODate): EditPermission {
  const s = getSettings();
  const today = todayFor(s.timezone);
  const end = addDays(s.startDate, s.lengthDays - 1);
  const no = (reason: string, canRequest = false): EditPermission => ({ editable: false, reason, unlockedByAdmin: false, canRequest });
  if (date < s.startDate || date > end) return no("This date is outside the competition.");
  if (date > today) return no("Future dates open on the day.");
  if (user.isAdmin) return { editable: true, reason: "Admins can edit any date.", unlockedByAdmin: false, canRequest: false };
  if (user.leadTeamId !== teamId) return no("Only this team's lead can enter steps.");
  if (!s.lockOlderDates || diffDays(date, today) <= s.correctionDays) {
    return { editable: true, reason: "", unlockedByAdmin: false, canRequest: false };
  }
  const unlocked = get("SELECT 1 FROM unlocked_dates WHERE season_id = ? AND date = ? AND team_id IN (?, '*')", seasonId(), date, teamId);
  if (unlocked) return { editable: true, reason: "Unlocked by an admin for corrections.", unlockedByAdmin: true, canRequest: false };
  return no("This date is locked. You can ask an admin to unlock it.", true);
}

// ───────────────────────── Daily entry ─────────────────────────

export interface DayRowInput {
  userId: string;
  steps: number | null;
  leave: boolean;
}

export interface SavedRow {
  userId: string;
  date: ISODate;
  steps: number | null;
  leave: boolean;
}

export function saveDay(actor: SessionUser, teamId: string, date: ISODate, rows: DayRowInput[]): { changed: number; saved: SavedRow[] } {
  const sid = seasonId();
  // Whoever was on the team that day, including people who have since moved or left.
  const members = new Set(
    all<{ user_id: string }>(
      "SELECT user_id FROM membership_history WHERE season_id = ? AND team_id = ? AND from_date <= ? AND (to_date IS NULL OR to_date >= ?)",
      sid, teamId, date, date,
    ).map((r) => r.user_id),
  );
  let changed = 0;
  const saved: SavedRow[] = [];
  tx(() => {
    for (const r of rows) {
      if (!members.has(r.userId)) throw new Error("A row does not belong to this team.");
      if (r.steps !== null && (!Number.isInteger(r.steps) || r.steps < 0)) throw new Error("Steps must be a whole number, zero or more.");
      const key = `${r.userId}|${date}`;
      const entry = get<{ steps: number }>("SELECT steps FROM step_entries WHERE season_id = ? AND user_id = ? AND date = ?", sid, r.userId, date);
      const onLeave = !!get("SELECT 1 FROM leave_records WHERE season_id = ? AND user_id = ? AND date = ?", sid, r.userId, date);
      const before = { steps: entry?.steps ?? null, leave: onLeave };
      const after = { steps: r.leave ? null : r.steps, leave: r.leave };
      if (before.steps === after.steps && before.leave === after.leave) continue;

      if (r.leave) {
        run("DELETE FROM step_entries WHERE season_id = ? AND user_id = ? AND date = ?", sid, r.userId, date);
        if (!onLeave) run("INSERT INTO leave_records (season_id, user_id, date, created_by) VALUES (?, ?, ?, ?)", sid, r.userId, date, actor.id);
      } else {
        if (onLeave) run("DELETE FROM leave_records WHERE season_id = ? AND user_id = ? AND date = ?", sid, r.userId, date);
        if (r.steps === null) run("DELETE FROM step_entries WHERE season_id = ? AND user_id = ? AND date = ?", sid, r.userId, date);
        else
          run(
            `INSERT INTO step_entries (season_id, user_id, date, steps, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(season_id, user_id, date) DO UPDATE SET steps = excluded.steps, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
            sid, r.userId, date, r.steps, actor.id,
          );
      }
      const action = before.steps === null && !before.leave ? "create" : after.steps === null && !after.leave ? "clear" : "update";
      audit(actor.id, action, "step_entry", key, before, after);
      saved.push({ userId: r.userId, date, ...after });
      changed++;
    }
  });
  if (changed > 0) recompute();
  return { changed, saved };
}

// ───────────────────────── Locks & corrections ─────────────────────────

export function unlockedDates(): { date: string; teamId: string; unlockedBy: string | null; unlockedAt: string }[] {
  return all("SELECT date, team_id AS teamId, unlocked_by AS unlockedBy, unlocked_at AS unlockedAt FROM unlocked_dates WHERE season_id = ? ORDER BY date DESC", seasonId());
}

export function setDateUnlocked(actorId: string, date: ISODate, teamId: string, unlocked: boolean): void {
  const sid = seasonId();
  if (unlocked) run("INSERT OR IGNORE INTO unlocked_dates (season_id, date, team_id, unlocked_by) VALUES (?, ?, ?, ?)", sid, date, teamId, actorId);
  else run("DELETE FROM unlocked_dates WHERE season_id = ? AND date = ? AND team_id = ?", sid, date, teamId);
  audit(actorId, unlocked ? "unlock" : "lock", "date_lock", `${date}|${teamId}`, null, null);
}

export interface CorrectionRequest {
  id: string;
  teamId: string;
  date: string;
  reason: string;
  requestedBy: string;
  status: "pending" | "approved" | "declined";
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export function correctionRequests(status?: string): CorrectionRequest[] {
  const where = status ? "AND status = ?" : "";
  const params = status ? [seasonId(), status] : [seasonId()];
  return all<CorrectionRequest>(
    `SELECT id, team_id AS teamId, date, reason, requested_by AS requestedBy, status, decided_by AS decidedBy, decided_at AS decidedAt, created_at AS createdAt
     FROM correction_requests WHERE season_id = ? ${where} ORDER BY created_at DESC`,
    ...params,
  );
}

export function requestCorrection(actor: SessionUser, teamId: string, date: ISODate, reason: string): void {
  const id = randomUUID();
  run("INSERT INTO correction_requests (id, season_id, team_id, date, reason, requested_by) VALUES (?, ?, ?, ?, ?, ?)", id, seasonId(), teamId, date, reason, actor.id);
  audit(actor.id, "request", "correction_request", id, null, { teamId, date, reason });
}

export function decideCorrection(actorId: string, id: string, approve: boolean): void {
  const req = get<{ team_id: string; date: string; status: string }>("SELECT team_id, date, status FROM correction_requests WHERE id = ?", id);
  if (!req || req.status !== "pending") return;
  tx(() => {
    run("UPDATE correction_requests SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?", approve ? "approved" : "declined", actorId, id);
    if (approve) run("INSERT OR IGNORE INTO unlocked_dates (season_id, date, team_id, unlocked_by) VALUES (?, ?, ?, ?)", seasonId(), req.date, req.team_id, actorId);
    audit(actorId, approve ? "approve" : "decline", "correction_request", id, { status: "pending" }, { status: approve ? "approved" : "declined" });
  });
}

export function leaveRecords(): { userId: string; date: string; createdBy: string | null; createdAt: string }[] {
  return all("SELECT user_id AS userId, date, created_by AS createdBy, created_at AS createdAt FROM leave_records WHERE season_id = ? ORDER BY date DESC", seasonId());
}

export function removeLeave(actorId: string, userId: string, date: ISODate): void {
  run("DELETE FROM leave_records WHERE season_id = ? AND user_id = ? AND date = ?", seasonId(), userId, date);
  audit(actorId, "remove", "leave", `${userId}|${date}`, { leave: true }, { leave: false }, "Leave removed by admin");
  recompute();
}

// ───────────────────────── Season settings ─────────────────────────

export function updateSettings(actorId: string, next: Settings): void {
  const prev = getSettings();
  const sid = seasonId();
  tx(() => {
    run(
      "UPDATE seasons SET name = ?, start_date = ?, length_days = ?, timezone = ?, rules_json = ? WHERE id = ?",
      next.seasonName, next.startDate, next.lengthDays, next.timezone, JSON.stringify(rulesOf(next)), sid,
    );
    if (prev.startDate !== next.startDate) {
      // Keep team history aligned with the new first day.
      run("DELETE FROM membership_history WHERE season_id = ? AND to_date IS NOT NULL AND to_date < ?", sid, next.startDate);
      run("UPDATE membership_history SET from_date = ? WHERE season_id = ? AND (from_date = ? OR from_date < ?)", next.startDate, sid, prev.startDate, next.startDate);
    }
    if (prev.startDate !== next.startDate || prev.lengthDays !== next.lengthDays) {
      writeFixtures(sid, next, teamRows(sid).map((t) => t.id));
    }
    audit(actorId, "update", "season", sid, prev, next);
  });
  recompute();
}

// ───────────────────────── Fixtures & challenges ─────────────────────────

const CHALLENGE_CYCLE: ChallengeType[] = ["five_day_move", "weekend_walk", "ten_k_day", "streak_builder"];

function writeFixtures(sid: string, settings: Settings, teamIds: string[]): void {
  const weekCount = seasonWeeks(settings.startDate, settings.lengthDays).length;
  run("DELETE FROM fixtures WHERE season_id = ?", sid);
  for (const f of generateFixtures(teamIds, weekCount)) {
    run("INSERT INTO fixtures (id, season_id, week_index, home_team_id, away_team_id) VALUES (?, ?, ?, ?, ?)", randomUUID(), sid, f.weekIndex, f.homeTeamId, f.awayTeamId);
  }
  run("DELETE FROM weekly_challenges WHERE season_id = ? AND week_index >= ?", sid, weekCount);
  for (let w = 0; w < weekCount; w++) {
    run("INSERT OR IGNORE INTO weekly_challenges (season_id, week_index, type) VALUES (?, ?, ?)", sid, w, CHALLENGE_CYCLE[w % CHALLENGE_CYCLE.length]);
  }
}

export function regenerateFixtures(actorId: string): void {
  const sid = seasonId();
  tx(() => {
    writeFixtures(sid, getSettings(), teamRows(sid).map((t) => t.id));
    audit(actorId, "regenerate", "fixtures", sid, null, null, "Schedule regenerated");
  });
  recompute();
}

/** Four-team weeks: choose who the first team plays; the other two teams meet each other. */
export function setWeekPairing(actorId: string, weekIndex: number, opponentId: string): void {
  const sid = seasonId();
  const ids = teamRows(sid).map((t) => t.id);
  if (ids.length !== 4 || !ids.includes(opponentId) || opponentId === ids[0]) throw new Error("Pairing can only be set for four teams.");
  const rest = ids.slice(1).filter((id) => id !== opponentId);
  tx(() => {
    const before = all("SELECT home_team_id, away_team_id FROM fixtures WHERE season_id = ? AND week_index = ?", sid, weekIndex);
    run("DELETE FROM fixtures WHERE season_id = ? AND week_index = ?", sid, weekIndex);
    run("INSERT INTO fixtures (id, season_id, week_index, home_team_id, away_team_id) VALUES (?, ?, ?, ?, ?)", randomUUID(), sid, weekIndex, ids[0], opponentId);
    run("INSERT INTO fixtures (id, season_id, week_index, home_team_id, away_team_id) VALUES (?, ?, ?, ?, ?)", randomUUID(), sid, weekIndex, rest[0], rest[1]);
    audit(actorId, "update", "fixtures", `week-${weekIndex + 1}`, before, [[ids[0], opponentId], rest]);
  });
  recompute();
}

export function setChallenge(actorId: string, weekIndex: number, type: ChallengeType | null): void {
  const sid = seasonId();
  const before = get<{ type: string }>("SELECT type FROM weekly_challenges WHERE season_id = ? AND week_index = ?", sid, weekIndex)?.type ?? null;
  if (type) run("INSERT INTO weekly_challenges (season_id, week_index, type) VALUES (?, ?, ?) ON CONFLICT(season_id, week_index) DO UPDATE SET type = excluded.type", sid, weekIndex, type);
  else run("DELETE FROM weekly_challenges WHERE season_id = ? AND week_index = ?", sid, weekIndex);
  audit(actorId, "update", "weekly_challenge", `week-${weekIndex + 1}`, before, type);
}

// ───────────────────────── Teams & members ─────────────────────────

export function updateTeam(actorId: string, teamId: string, patch: { name: string; color: string; icon: string; leadUserId: string | null }): void {
  const before = get("SELECT name, color, icon, lead_user_id FROM teams WHERE id = ?", teamId);
  const slug = patch.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || teamId;
  run("UPDATE teams SET name = ?, slug = ?, color = ?, icon = ?, lead_user_id = ? WHERE id = ?", patch.name, slug, patch.color, patch.icon, patch.leadUserId, teamId);
  audit(actorId, "update", "team", teamId, before, patch);
}

export function addMember(actorId: string, input: { name: string; email: string; teamId: string | null; isAdmin: boolean }): { password: string } {
  const password = randomBytes(4).toString("hex");
  const id = `user-${randomUUID()}`;
  tx(() => {
    run("INSERT INTO users (id, name, email, password_hash, is_admin) VALUES (?, ?, ?, ?, ?)", id, input.name, input.email.trim(), hashPassword(password), input.isAdmin ? 1 : 0);
    if (input.teamId) {
      run("INSERT INTO team_members (season_id, user_id, team_id) VALUES (?, ?, ?)", seasonId(), id, input.teamId);
      changeMembership(seasonId(), id, input.teamId, effectiveDate());
    }
    audit(actorId, "create", "user", id, null, input);
  });
  recompute();
  return { password };
}

export function updateMember(actorId: string, userId: string, patch: { name: string; email: string; teamId: string | null; isAdmin: boolean; active: boolean }): void {
  const sid = seasonId();
  const before = findUser(userId);
  tx(() => {
    run("UPDATE users SET name = ?, email = ?, is_admin = ?, active = ? WHERE id = ?", patch.name, patch.email.trim(), patch.isAdmin ? 1 : 0, patch.active ? 1 : 0, userId);
    run("DELETE FROM team_members WHERE season_id = ? AND user_id = ?", sid, userId);
    if (patch.teamId) run("INSERT INTO team_members (season_id, user_id, team_id) VALUES (?, ?, ?)", sid, userId, patch.teamId);
    const wasOn = before?.active ? before.teamId : null;
    const nowOn = patch.active ? patch.teamId : null;
    if (wasOn !== nowOn) changeMembership(sid, userId, nowOn, effectiveDate());
    if (!patch.teamId || patch.teamId !== before?.teamId || !patch.active) {
      run("UPDATE teams SET lead_user_id = NULL WHERE season_id = ? AND lead_user_id = ? AND id IS NOT ?", sid, userId, patch.active ? patch.teamId : null);
    }
    if (!patch.active) run("DELETE FROM sessions WHERE user_id = ?", userId);
    audit(actorId, "update", "user", userId, before, patch);
  });
  recompute();
}

export function setPassword(actorId: string, userId: string, password: string): void {
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(password), userId);
  run("DELETE FROM sessions WHERE user_id = ?", userId);
  audit(actorId, "reset_password", "user", userId, null, null);
}

// ───────────────────────── Import / export ─────────────────────────

export function exportRows(): { date: string; name: string; email: string; team: string; steps: number | ""; onLeave: "yes" | ""; points: number | ""; updatedBy: string; updatedAt: string }[] {
  const sid = seasonId();
  const settings = getSettings();
  const users = new Map(listUsers().map((u) => [u.id, u]));
  const teams = new Map(listTeams().map((t) => [t.id, t.name]));
  const entries = all<{ user_id: string; date: string; steps: number; updated_by: string | null; updated_at: string }>(
    "SELECT user_id, date, steps, updated_by, updated_at FROM step_entries WHERE season_id = ?", sid,
  );
  const leaves = all<{ user_id: string; date: string; created_by: string | null; created_at: string }>(
    "SELECT user_id, date, created_by, created_at FROM leave_records WHERE season_id = ?", sid,
  );
  const row = (userId: string, date: string) => {
    const u = users.get(userId);
    const teamId = teamOnDate(userId, date);
    return { name: u?.name ?? userId, email: u?.email ?? "", team: teamId ? teams.get(teamId) ?? "" : "" };
  };
  return [
    ...entries.map((e) => ({ date: e.date, ...row(e.user_id, e.date), steps: e.steps, onLeave: "" as const, points: pointsFor(e.steps, settings.bands), updatedBy: users.get(e.updated_by ?? "")?.name ?? "", updatedAt: e.updated_at })),
    ...leaves.map((l) => ({ date: l.date, ...row(l.user_id, l.date), steps: "" as const, onLeave: "yes" as const, points: "" as const, updatedBy: users.get(l.created_by ?? "")?.name ?? "", updatedAt: l.created_at })),
  ].sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1));
}

export function importRows(actor: SessionUser, rows: { date: string; email: string; steps: string; leave: string }[]): { imported: number; errors: string[] } {
  const s = getSettings();
  const end = addDays(s.startDate, s.lengthDays - 1);
  const errors: string[] = [];
  const byTeamDate = new Map<string, DayRowInput[]>();
  rows.forEach((r, i) => {
    const line = i + 2;
    const user = findUserByEmail(r.email);
    if (!user) return errors.push(`Row ${line}: no participant with email "${r.email}".`);
    if (!isValidISODate(r.date) || r.date < s.startDate || r.date > end) return errors.push(`Row ${line}: date "${r.date}" is not in the season.`);
    const teamId = teamOnDate(user.id, r.date);
    if (!teamId) return errors.push(`Row ${line}: ${user.name} wasn't on a team on ${r.date}.`);
    const leave = /^(y|yes|true|1)$/i.test(r.leave.trim());
    const raw = r.steps.replace(/[,\s]/g, "");
    if (!leave && raw !== "" && !/^\d+$/.test(raw)) return errors.push(`Row ${line}: steps "${r.steps}" must be a whole number.`);
    const key = `${teamId}|${r.date}`;
    const list = byTeamDate.get(key) ?? [];
    list.push({ userId: user.id, steps: leave || raw === "" ? null : Number(raw), leave });
    byTeamDate.set(key, list);
  });
  if (errors.length) return { imported: 0, errors };
  let imported = 0;
  for (const [key, list] of byTeamDate) {
    const [teamId, date] = key.split("|");
    imported += saveDay(actor, teamId, date, list).changed;
  }
  return { imported, errors };
}

// ───────────────────────── Recompute & materialise ─────────────────────────

export function recompute(): Season {
  const season = computeCurrent();
  const sid = seasonId();
  tx(() => {
    run("DELETE FROM fixture_results WHERE fixture_id IN (SELECT id FROM fixtures WHERE season_id = ?)", sid);
    for (const f of season.fixtures) {
      run("INSERT INTO fixture_results (fixture_id, home_points, away_points, outcome, status) VALUES (?, ?, ?, ?, ?)", f.id, f.home.points, f.away.points, f.outcome, f.status);
    }
    run("DELETE FROM league_standings WHERE season_id = ?", sid);
    for (const r of season.standings) {
      run(
        "INSERT INTO league_standings (season_id, team_id, position, played, won, drawn, lost, points, activity, steps) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        sid, r.teamId, r.position, r.played, r.won, r.drawn, r.lost, r.points, r.activity, r.steps,
      );
    }
    run("DELETE FROM weekly_awards WHERE season_id = ?", sid);
    for (const a of season.weeklyAwards) {
      for (const [award, winners] of [["mvp", a.mvp], ["consistency", a.consistency], ["comeback", a.comeback], ["team_player", a.teamPlayer]] as const) {
        for (const w of winners) run("INSERT INTO weekly_awards (season_id, week_index, award, user_id, detail, final) VALUES (?, ?, ?, ?, ?, ?)", sid, a.weekIndex, award, w.userId, w.detail, a.final ? 1 : 0);
      }
    }
    run("DELETE FROM monthly_cups WHERE season_id = ?", sid);
    for (const c of season.monthlyCups) {
      for (const t of c.totals) run("INSERT INTO monthly_cups (season_id, month, team_id, points, status, winner) VALUES (?, ?, ?, ?, ?, ?)", sid, c.key, t.teamId, t.points, c.status, c.winners.includes(t.teamId) ? 1 : 0);
    }
    run("DELETE FROM user_badges WHERE season_id = ?", sid);
    for (const b of season.badgeUnlocks) run("INSERT INTO user_badges (season_id, user_id, badge_id, unlocked_on) VALUES (?, ?, ?, ?)", sid, b.userId, b.badgeId, b.date);
  });
  return season;
}
