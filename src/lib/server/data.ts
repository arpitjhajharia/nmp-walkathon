// Request-scoped reads and writes, made as the signed-in user so Supabase row-level
// security decides what's allowed. After any change, results are recomputed and stored.

import { randomBytes } from "node:crypto";
import { cache } from "react";
import { addDays, diffDays, type ISODate } from "../engine/dates.ts";
import { generateFixtures, pointsFor, seasonWeeks } from "../engine/engine.ts";
import type { ChallengeType, Settings, Team } from "../engine/types.ts";
import { createAdminClient, hasServiceKey } from "../supabase/admin.ts";
import { userDb } from "../supabase/server";
import { activeSeason, fetchAll, loadContacts, loadTeams, loadUsers, must, recomputeWith, settingsOf, todayFor, type Contact, type SeasonRow, type UserRecord } from "./repo.ts";

export type { Contact, UserRecord } from "./repo.ts";
export { todayFor } from "./repo.ts";

// ───────────────────────── Reads ─────────────────────────

export const currentSeason = cache(async (): Promise<SeasonRow> => {
  const season = await activeSeason(await userDb());
  if (!season) throw new Error("No active season yet. Run `npm run setup` (or `npm run seed:demo`) first.");
  return season;
});

export async function getSettings(): Promise<Settings> {
  return settingsOf(await currentSeason());
}

export const listTeams = cache(async (): Promise<Team[]> => loadTeams(await userDb(), (await currentSeason()).id));

export const listUsers = cache(async (): Promise<UserRecord[]> => loadUsers(await userDb(), (await currentSeason()).id));

export async function findUser(id: string): Promise<UserRecord | null> {
  return (await listUsers()).find((u) => u.id === id) ?? null;
}

export async function entriesForDate(date: ISODate): Promise<{ userId: string; steps: number; updatedBy: string | null; updatedAt: string }[]> {
  const db = await userDb();
  const rows = must(
    await db.from("step_entries").select("user_id, steps, updated_by, updated_at").eq("season_id", (await currentSeason()).id).eq("date", date),
    "Loading entries",
  ) as { user_id: string; steps: number; updated_by: string | null; updated_at: string }[];
  return rows.map((r) => ({ userId: r.user_id, steps: r.steps, updatedBy: r.updated_by, updatedAt: r.updated_at }));
}

export interface AuditRow {
  id: number;
  at: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityKey: string;
  before: unknown;
  after: unknown;
  note: string | null;
}

export async function auditLog(limit = 200, entities?: string[]): Promise<AuditRow[]> {
  const db = await userDb();
  let q = db.from("audit_log").select("id, at, actor_id, action, entity, entity_key, before_json, after_json, note").order("id", { ascending: false }).limit(limit);
  if (entities?.length) q = q.in("entity", entities);
  const rows = must(await q, "Loading the audit log") as {
    id: number; at: string; actor_id: string | null; action: string; entity: string; entity_key: string; before_json: unknown; after_json: unknown; note: string | null;
  }[];
  return rows.map((r) => ({ id: r.id, at: r.at, actorId: r.actor_id, action: r.action, entity: r.entity, entityKey: r.entity_key, before: r.before_json, after: r.after_json, note: r.note }));
}

// ───────────────────────── Helpers ─────────────────────────

async function audit(action: string, entity: string, key: string, before: unknown, after: unknown, note?: string): Promise<void> {
  const db = await userDb();
  must(await db.rpc("write_audit", { p_action: action, p_entity: entity, p_key: key, p_before: before ?? null, p_after: after ?? null, p_note: note ?? null }), "Writing the audit log");
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const db = await userDb();
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

/** Refresh the stored results tables. Pages compute live, so this never blocks a save. */
export async function recompute(): Promise<void> {
  if (!hasServiceKey()) return;
  try {
    await recomputeWith(createAdminClient());
  } catch (err) {
    console.error("[recompute] results tables not refreshed", err);
  }
}

/** First day a team change takes effect: today, or day one if the season hasn't started. */
async function effectiveDate(): Promise<ISODate> {
  const s = await getSettings();
  const today = todayFor(s.timezone);
  return today > s.startDate ? today : s.startDate;
}

// ───────────────────────── Editable dates (for friendly messages; the database enforces) ─────────────────────────

/** Admins can enter any day of the season up to today. Returns a reason when they can't. */
export async function dateProblem(date: ISODate): Promise<string | null> {
  const s = await getSettings();
  const end = addDays(s.startDate, s.lengthDays - 1);
  if (date < s.startDate || date > end) return "This date is outside the competition.";
  if (date > todayFor(s.timezone)) return "Future dates open on the day.";
  return null;
}

// ───────────────────────── Daily entry ─────────────────────────

export interface DayRowInput {
  userId: string;
  steps: number | null;
  leave: boolean;
}

export async function saveDay(teamId: string, date: ISODate, rows: DayRowInput[]): Promise<{ changed: number }> {
  const season = await currentSeason();
  const changed = (await rpc("save_day", { p_season: season.id, p_team: teamId, p_date: date, p_rows: rows })) as number;
  if (changed > 0) await recompute();
  return { changed };
}

// ───────────────────────── Leave ─────────────────────────

export async function leaveRecords(limit = 25): Promise<{ userId: string; date: string; createdBy: string | null; createdAt: string }[]> {
  const db = await userDb();
  const rows = must(
    await db.from("leave_records").select("user_id, date, created_by, created_at").eq("season_id", (await currentSeason()).id).order("date", { ascending: false }).limit(limit),
    "Loading leave",
  ) as { user_id: string; date: string; created_by: string | null; created_at: string }[];
  return rows.map((r) => ({ userId: r.user_id, date: r.date, createdBy: r.created_by, createdAt: r.created_at }));
}

export async function removeLeave(userId: string, date: ISODate): Promise<void> {
  const db = await userDb();
  must(await db.from("leave_records").delete().eq("season_id", (await currentSeason()).id).eq("user_id", userId).eq("date", date), "Removing leave");
  await recompute();
}

// ───────────────────────── Season settings, fixtures & challenges ─────────────────────────

function rulesOf(s: Settings) {
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

async function fixturePlan(settings: Pick<Settings, "startDate" | "lengthDays">) {
  const weekCount = seasonWeeks(settings.startDate, settings.lengthDays).length;
  const fixtures = generateFixtures((await listTeams()).map((t) => t.id), weekCount);
  return { weekCount, fixtures };
}

export async function updateSettings(next: Settings): Promise<{ rebuiltFixtures: boolean }> {
  const season = await currentSeason();
  const prev = settingsOf(season);
  const datesChanged = prev.startDate !== next.startDate || prev.lengthDays !== next.lengthDays;
  const plan = datesChanged ? await fixturePlan(next) : null;
  await rpc("update_season", {
    p_season: season.id,
    p_name: next.seasonName,
    p_start: next.startDate,
    p_length: next.lengthDays,
    p_timezone: next.timezone,
    p_rules: rulesOf(next),
    p_fixtures: plan?.fixtures ?? null,
    p_week_count: plan?.weekCount ?? null,
  });
  await audit("update", "season", season.id, prev, next);
  await recompute();
  return { rebuiltFixtures: datesChanged };
}

export async function regenerateFixtures(): Promise<void> {
  const season = await currentSeason();
  const plan = await fixturePlan(settingsOf(season));
  await rpc("replace_fixtures", { p_season: season.id, p_fixtures: plan.fixtures, p_week_count: plan.weekCount });
  await audit("regenerate", "fixtures", season.id, null, null, "Schedule regenerated");
  await recompute();
}

/** Four-team weeks: choose who the first team plays; the other two teams meet each other. */
export async function setWeekPairing(weekIndex: number, opponentId: string): Promise<void> {
  const ids = (await listTeams()).map((t) => t.id);
  if (ids.length !== 4 || !ids.includes(opponentId) || opponentId === ids[0]) throw new Error("Pairings can only be set when there are four teams.");
  const rest = ids.slice(1).filter((id) => id !== opponentId);
  const fixtures = [
    { homeTeamId: ids[0], awayTeamId: opponentId },
    { homeTeamId: rest[0], awayTeamId: rest[1] },
  ];
  await rpc("set_week_fixtures", { p_season: (await currentSeason()).id, p_week: weekIndex, p_fixtures: fixtures });
  await audit("update", "fixtures", `week-${weekIndex + 1}`, null, fixtures);
  await recompute();
}

export async function setChallenge(weekIndex: number, type: ChallengeType | null): Promise<void> {
  const db = await userDb();
  const sid = (await currentSeason()).id;
  if (type) must(await db.from("weekly_challenges").upsert({ season_id: sid, week_index: weekIndex, type }), "Saving the challenge");
  else must(await db.from("weekly_challenges").delete().eq("season_id", sid).eq("week_index", weekIndex), "Removing the challenge");
  await audit("update", "weekly_challenge", `week-${weekIndex + 1}`, null, type);
}

// ───────────────────────── Teams & members ─────────────────────────

export async function updateTeam(teamId: string, patch: { name: string; color: string; icon: string; leadUserId: string | null }): Promise<void> {
  const db = await userDb();
  const slug = patch.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || teamId;
  must(await db.from("teams").update({ name: patch.name, slug, color: patch.color, icon: patch.icon, lead_user_id: patch.leadUserId }).eq("id", teamId), "Saving the team");
  await audit("update", "team", teamId, null, patch);
}

export function temporaryPassword(): string {
  const words = ["stride", "trail", "pace", "summit", "sprint", "walk", "step", "ridge"];
  return `${words[randomBytes(1)[0] % words.length]}-${randomBytes(4).toString("hex")}`;
}

/** Emails and sign-in links for everyone (admins only; the database returns nothing otherwise). */
export const listContacts = cache(async (): Promise<Map<string, Contact>> => loadContacts(await userDb()));

/** Create a sign-in account for an admin and link it. Returns the temporary password. */
async function createLogin(profileId: string, email: string, name: string): Promise<string> {
  const password = temporaryPassword();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create the sign-in account.");
  const db = await userDb();
  const linked = await db.from("profiles").update({ auth_user_id: data.user.id }).eq("id", profileId).select("id");
  if (linked.error || linked.data?.length !== 1) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(linked.error?.message ?? "Only admins can grant admin access.");
  }
  return password;
}

/** Add a person. Only admins get a sign-in account (and a temporary password). */
export async function addMember(input: { name: string; email: string; teamId: string | null; isAdmin: boolean }): Promise<{ password: string | null }> {
  const db = await userDb();
  const row = must(
    await db.from("profiles").insert({ name: input.name, email: input.email, is_admin: input.isAdmin, active: true }).select("id").single(),
    "Adding the member",
  ) as { id: string };
  if (input.teamId) await rpc("set_member_team", { p_season: (await currentSeason()).id, p_user: row.id, p_team: input.teamId, p_effective: await effectiveDate() });
  const password = input.isAdmin ? await createLogin(row.id, input.email, input.name) : null;
  await audit("create", "user", row.id, null, input);
  await recompute();
  return { password };
}

export async function updateMember(userId: string, patch: { name: string; email: string; teamId: string | null; active: boolean }): Promise<void> {
  const before = await findUser(userId);
  if (!before) throw new Error("That member no longer exists.");
  const contact = (await listContacts()).get(userId);
  const db = await userDb();
  // Profile first: the database checks the caller is an admin before anything else changes.
  const updated = must(
    await db.from("profiles").update({ name: patch.name, email: patch.email, active: patch.active }).eq("id", userId).select("id"),
    "Saving the member",
  ) as unknown[];
  if (updated.length !== 1) throw new Error("Only admins can change members.");
  if (contact?.authUserId) {
    const account: { email?: string; email_confirm?: boolean; ban_duration?: string; user_metadata?: object } = { user_metadata: { name: patch.name } };
    if (patch.email.toLowerCase() !== contact.email.toLowerCase()) Object.assign(account, { email: patch.email, email_confirm: true });
    if (patch.active !== before.active) account.ban_duration = patch.active ? "none" : "876000h";
    const { error } = await createAdminClient().auth.admin.updateUserById(contact.authUserId, account);
    if (error) throw new Error(error.message);
  }
  await rpc("set_member_team", { p_season: (await currentSeason()).id, p_user: userId, p_team: patch.teamId, p_effective: await effectiveDate() });
  await audit("update", "user", userId, before, patch);
  await recompute();
}

/** Give or remove admin access. Granting creates a sign-in account if needed and returns its temporary password. */
export async function setAdminAccess(userId: string, grant: boolean): Promise<{ password: string | null }> {
  const person = await findUser(userId);
  const contact = (await listContacts()).get(userId);
  if (!person || !contact) throw new Error("That member no longer exists.");
  const db = await userDb();
  const updated = must(await db.from("profiles").update({ is_admin: grant }).eq("id", userId).select("id"), "Saving admin access") as unknown[];
  if (updated.length !== 1) throw new Error("Only admins can change admin access.");
  let password: string | null = null;
  if (grant && !contact.authUserId) password = await createLogin(userId, contact.email, person.name);
  if (contact.authUserId) {
    // Removing admin access also stops them signing in; granting it again lets them back in.
    const { error } = await createAdminClient().auth.admin.updateUserById(contact.authUserId, { ban_duration: grant ? "none" : "876000h" });
    if (error) throw new Error(error.message);
  }
  await audit(grant ? "grant_admin" : "revoke_admin", "user", userId, null, null);
  return { password };
}

/** Callers must have checked the current user is an admin (the account API bypasses row-level security). */
export async function setPassword(userId: string, password: string): Promise<void> {
  const contact = (await listContacts()).get(userId);
  if (!contact?.authUserId) throw new Error("This person doesn't have a sign-in account.");
  const { error } = await createAdminClient().auth.admin.updateUserById(contact.authUserId, { password });
  if (error) throw new Error(error.message);
  await audit("reset_password", "user", userId, null, null);
}

// ───────────────────────── Import / export ─────────────────────────

export async function exportRows() {
  const db = await userDb();
  const season = await currentSeason();
  const settings = settingsOf(season);
  const users = new Map((await listUsers()).map((u) => [u.id, u]));
  const teams = new Map((await listTeams()).map((t) => [t.id, t.name]));
  const history = await fetchAll<{ user_id: string; team_id: string; from_date: string; to_date: string | null }>((a, b) =>
    db.from("membership_history").select("user_id, team_id, from_date, to_date").eq("season_id", season.id).order("from_date").range(a, b),
  );
  const teamOn = (userId: string, date: string) => history.find((h) => h.user_id === userId && h.from_date <= date && (!h.to_date || date <= h.to_date))?.team_id;
  const entries = await fetchAll<{ user_id: string; date: string; steps: number; updated_by: string | null; updated_at: string }>((a, b) =>
    db.from("step_entries").select("user_id, date, steps, updated_by, updated_at").eq("season_id", season.id).order("date").order("user_id").range(a, b),
  );
  const leaves = await fetchAll<{ user_id: string; date: string; created_by: string | null; created_at: string }>((a, b) =>
    db.from("leave_records").select("user_id, date, created_by, created_at").eq("season_id", season.id).order("date").order("user_id").range(a, b),
  );
  const contacts = await listContacts();
  const who = (userId: string, date: string) => {
    const t = teamOn(userId, date);
    return { name: users.get(userId)?.name ?? userId, email: contacts.get(userId)?.email ?? "", team: t ? teams.get(t) ?? "" : "" };
  };
  return [
    ...entries.map((e) => ({ date: e.date, ...who(e.user_id, e.date), steps: e.steps as number | "", onLeave: "" as "yes" | "", points: pointsFor(e.steps, settings.bands) as number | "", updatedBy: users.get(e.updated_by ?? "")?.name ?? "", updatedAt: e.updated_at })),
    ...leaves.map((l) => ({ date: l.date, ...who(l.user_id, l.date), steps: "" as const, onLeave: "yes" as const, points: "" as const, updatedBy: users.get(l.created_by ?? "")?.name ?? "", updatedAt: l.created_at })),
  ].sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1));
}

export async function importRows(rows: { date: string; email: string; steps: string; leave: string }[]): Promise<{ imported: number; errors: string[] }> {
  const db = await userDb();
  const season = await currentSeason();
  const s = settingsOf(season);
  const end = addDays(s.startDate, s.lengthDays - 1);
  const contacts = await listContacts();
  const users = new Map((await listUsers()).filter((u) => contacts.has(u.id)).map((u) => [contacts.get(u.id)!.email.toLowerCase(), u]));
  const history = await fetchAll<{ user_id: string; team_id: string; from_date: string; to_date: string | null }>((a, b) =>
    db.from("membership_history").select("user_id, team_id, from_date, to_date").eq("season_id", season.id).order("from_date").range(a, b),
  );
  const errors: string[] = [];
  const byTeamDate = new Map<string, DayRowInput[]>();
  rows.forEach((r, i) => {
    const line = i + 2;
    const user = users.get(r.email.trim().toLowerCase());
    if (!user) return errors.push(`Row ${line}: no participant with email "${r.email}".`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date < s.startDate || r.date > end) return errors.push(`Row ${line}: date "${r.date}" is not in the season.`);
    const teamId = history.find((h) => h.user_id === user.id && h.from_date <= r.date && (!h.to_date || r.date <= h.to_date))?.team_id;
    if (!teamId) return errors.push(`Row ${line}: ${user.name} wasn't on a team on ${r.date}.`);
    const leave = /^(y|yes|true|1)$/i.test(r.leave.trim());
    const raw = r.steps.replace(/[,\s]/g, "");
    if (!leave && raw !== "" && !/^\d+$/.test(raw)) return errors.push(`Row ${line}: steps "${r.steps}" must be a whole number.`);
    const key = `${teamId}|${r.date}`;
    byTeamDate.set(key, [...(byTeamDate.get(key) ?? []), { userId: user.id, steps: leave || raw === "" ? null : Number(raw), leave }]);
  });
  if (errors.length) return { imported: 0, errors };
  let imported = 0;
  for (const [key, list] of byTeamDate) {
    const [teamId, date] = key.split("|");
    try {
      imported += (await rpc("save_day", { p_season: season.id, p_team: teamId, p_date: date, p_rows: list })) as number;
    } catch (err) {
      errors.push(`${date}: ${err instanceof Error ? err.message : "could not save"}`);
    }
  }
  if (imported > 0) await recompute();
  return { imported, errors };
}
