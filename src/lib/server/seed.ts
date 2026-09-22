// Demo data and first-time setup. Uses the service-role client; no Next.js imports, so
// the npm scripts in scripts/ can run it directly.

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, mondayOf } from "../engine/dates.ts";
import { DEFAULT_SETTINGS } from "../engine/defaults.ts";
import { DEMO_PASSWORD, buildDemoData } from "../engine/demo.ts";
import { generateFixtures, seasonWeeks } from "../engine/engine.ts";
import type { ChallengeType, Settings } from "../engine/types.ts";
import { activeSeason, must, recomputeWith, todayFor } from "./repo.ts";

const CHALLENGE_CYCLE: ChallengeType[] = ["five_day_move", "weekend_walk", "ten_k_day", "streak_builder"];

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

async function authUsersByEmail(admin: SupabaseClient): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Listing accounts failed: ${error.message}`);
    for (const u of data.users) if (u.email) out.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) return out;
  }
}

/** Create the sign-in account, or reset its password if it already exists. Returns the user id. */
export async function upsertAccount(admin: SupabaseClient, existing: Map<string, string>, email: string, password: string, name: string): Promise<string> {
  const id = existing.get(email.toLowerCase());
  if (id) {
    const { error } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true, user_metadata: { name }, ban_duration: "none" });
    if (error) throw new Error(`Updating ${email} failed: ${error.message}`);
    return id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw new Error(`Creating ${email} failed: ${error?.message}`);
  existing.set(email.toLowerCase(), data.user.id);
  return data.user.id;
}

async function insertSeason(admin: SupabaseClient, settings: Settings): Promise<string> {
  const row = must(
    await admin
      .from("seasons")
      .insert({ name: settings.seasonName, start_date: settings.startDate, length_days: settings.lengthDays, timezone: settings.timezone, rules: rulesOf(settings), is_active: true })
      .select("id")
      .single(),
    "Creating the season",
  ) as { id: string };
  return row.id;
}

async function insertFixtures(admin: SupabaseClient, seasonId: string, settings: Settings, teamIds: string[]): Promise<number> {
  const weekCount = seasonWeeks(settings.startDate, settings.lengthDays).length;
  const rows = generateFixtures(teamIds, weekCount).map((f) => ({ season_id: seasonId, week_index: f.weekIndex, home_team_id: f.homeTeamId, away_team_id: f.awayTeamId }));
  if (rows.length) must(await admin.from("fixtures").insert(rows), "Creating fixtures");
  return weekCount;
}

async function insertChunks(admin: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 1000) must(await admin.from(table).insert(rows.slice(i, i + 1000)), `Writing ${table}`);
}

/** Replace the season with fresh demo data dated around today. Demo accounts use DEMO_PASSWORD. */
export async function seedDemo(admin: SupabaseClient, log: (m: string) => void = () => {}): Promise<void> {
  const demo = buildDemoData(todayFor(DEFAULT_SETTINGS.timezone));

  log("Preparing 21 demo sign-in accounts…");
  const accounts = await authUsersByEmail(admin);
  const idOf = new Map<string, string>();
  for (const m of demo.members) idOf.set(m.id, await upsertAccount(admin, accounts, m.email, DEMO_PASSWORD, m.name));

  log("Clearing the old season…");
  must(await admin.from("seasons").delete().not("id", "is", null), "Clearing seasons");
  must(await admin.from("audit_log").delete().gte("id", 0), "Clearing the audit log");
  must(
    await admin.from("profiles").upsert(demo.members.map((m) => ({ id: idOf.get(m.id)!, name: m.name, email: m.email, is_admin: m.isAdmin, active: true }))),
    "Saving profiles",
  );

  log("Creating teams, entries and fixtures…");
  const seasonId = await insertSeason(admin, demo.settings);
  const teams = must(
    await admin
      .from("teams")
      .insert(
        demo.teams.map((t, i) => ({
          season_id: seasonId,
          slug: t.slug,
          name: t.name,
          color: t.color,
          icon: t.icon,
          sort_order: i,
          lead_user_id: idOf.get(demo.members.find((m) => m.teamId === t.id && m.isLead)!.id),
        })),
      )
      .select("id, slug"),
    "Creating teams",
  ) as { id: string; slug: string }[];
  const teamIdOf = new Map(demo.teams.map((t) => [t.id, teams.find((x) => x.slug === t.slug)!.id]));
  const onTeam = demo.members.filter((m) => m.teamId);
  await insertChunks(admin, "team_members", onTeam.map((m) => ({ season_id: seasonId, user_id: idOf.get(m.id), team_id: teamIdOf.get(m.teamId!) })));
  await insertChunks(
    admin,
    "membership_history",
    onTeam.map((m) => ({ season_id: seasonId, user_id: idOf.get(m.id), team_id: teamIdOf.get(m.teamId!), from_date: demo.settings.startDate })),
  );
  const leadOf = (userId: string) => {
    const teamId = demo.members.find((m) => m.id === userId)?.teamId;
    return idOf.get(demo.members.find((m) => m.teamId === teamId && m.isLead)!.id);
  };
  await insertChunks(
    admin,
    "step_entries",
    demo.entries.map((e) => ({ season_id: seasonId, user_id: idOf.get(e.userId), date: e.date, steps: e.steps, updated_by: leadOf(e.userId), updated_at: `${e.date}T15:00:00Z` })),
  );
  await insertChunks(admin, "leave_records", demo.leaves.map((l) => ({ season_id: seasonId, user_id: idOf.get(l.userId), date: l.date, created_by: leadOf(l.userId) })));
  await insertFixtures(admin, seasonId, demo.settings, demo.teams.map((t) => teamIdOf.get(t.id)!));
  await insertChunks(admin, "weekly_challenges", demo.challenges.map((c) => ({ season_id: seasonId, week_index: c.weekIndex, type: c.type })));

  log("Calculating results…");
  await recomputeWith(admin);
  must(await admin.from("audit_log").insert({ action: "reset", entity: "demo", entity_key: seasonId, note: "Demo data seeded" }), "Logging the reset");
}

/**
 * First-time setup for a real season: four placeholder teams starting next Monday, plus
 * an admin account. Safe to re-run: it never touches an existing season.
 */
export async function setupSeason(admin: SupabaseClient, adminAccount: { email: string; password: string; name: string }, log: (m: string) => void = () => {}): Promise<void> {
  const accounts = await authUsersByEmail(admin);
  const adminId = await upsertAccount(admin, accounts, adminAccount.email, adminAccount.password, adminAccount.name);
  must(await admin.from("profiles").upsert({ id: adminId, name: adminAccount.name, email: adminAccount.email, is_admin: true, active: true }), "Saving the admin profile");
  log(`Admin account ready: ${adminAccount.email}`);

  if (await activeSeason(admin)) {
    log("A season already exists; left unchanged.");
    return;
  }
  const settings: Settings = { ...DEFAULT_SETTINGS, startDate: mondayOf(addDays(todayFor(DEFAULT_SETTINGS.timezone), 7)) };
  const seasonId = await insertSeason(admin, settings);
  const teams = must(
    await admin
      .from("teams")
      .insert(
        [
          ["Comets", "#1D4ED8", "rocket"],
          ["Striders", "#15803D", "footprints"],
          ["Blazers", "#C2410C", "flame"],
          ["Nomads", "#7E22CE", "compass"],
        ].map(([name, color, icon], i) => ({ season_id: seasonId, slug: name.toLowerCase(), name, color, icon, sort_order: i })),
      )
      .select("id"),
    "Creating teams",
  ) as { id: string }[];
  const weekCount = await insertFixtures(admin, seasonId, settings, teams.map((t) => t.id));
  await insertChunks(
    admin,
    "weekly_challenges",
    Array.from({ length: weekCount }, (_, w) => ({ season_id: seasonId, week_index: w, type: CHALLENGE_CYCLE[w % CHALLENGE_CYCLE.length] })),
  );
  log(`Season created, starting ${settings.startDate}. Rename teams and add members in Admin.`);
}
