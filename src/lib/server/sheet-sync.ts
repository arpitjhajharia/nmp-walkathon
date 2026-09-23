// Pulls daily steps from the Google Sheet into the database. Runs with the service-role
// client so it also works from the scheduled job, where nobody is signed in.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ISODate } from "../engine/dates.ts";
import { activeSeason, fetchAll, loadUsers, must, recomputeWith, settingsOf, todayFor } from "./repo.ts";
import { fetchSheetCsv, parseSheet } from "./sheet.ts";
import { dateRange } from "../engine/dates.ts";

export interface SyncResult {
  changed: number;
  unchanged: number;
  skippedFuture: number;
  unmatchedPlayers: string[];
  wrongTeam: string[];
  problems: string[];
  unknownDates: string[];
  ranAt: string;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, " ").trim();

export async function syncFromSheet(db: SupabaseClient): Promise<SyncResult> {
  const season = await activeSeason(db);
  if (!season) throw new Error("No active season.");
  const settings = settingsOf(season);
  const seasonDates = dateRange(settings.startDate, settings.lengthDays);
  const today = todayFor(settings.timezone);

  const csv = await fetchSheetCsv();
  const parsed = parseSheet(csv, seasonDates);

  const people = await loadUsers(db, season.id);
  const byName = new Map(people.filter((p) => p.teamId).map((p) => [normalise(p.name), p]));
  const teams = must(await db.from("teams").select("id, name").eq("season_id", season.id), "Loading teams") as { id: string; name: string }[];
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  const entries = await fetchAll<{ user_id: string; date: string; steps: number }>((a, b) =>
    db.from("step_entries").select("user_id, date, steps").eq("season_id", season.id).order("date").order("user_id").range(a, b),
  );
  const leaves = await fetchAll<{ user_id: string; date: string }>((a, b) =>
    db.from("leave_records").select("user_id, date").eq("season_id", season.id).order("date").order("user_id").range(a, b),
  );
  const stepsNow = new Map(entries.map((e) => [`${e.user_id}|${e.date}`, e.steps]));
  const leaveNow = new Set(leaves.map((l) => `${l.user_id}|${l.date}`));

  const result: SyncResult = {
    changed: 0,
    unchanged: 0,
    skippedFuture: 0,
    unmatchedPlayers: [],
    wrongTeam: [],
    problems: parsed.problems,
    unknownDates: parsed.unknownDates,
    ranAt: new Date().toISOString(),
  };

  const entryUpserts: { season_id: string; user_id: string; date: ISODate; steps: number; updated_by: null; updated_at: string }[] = [];
  const entryDeletes: { userId: string; date: ISODate }[] = [];
  const leaveInserts: { season_id: string; user_id: string; date: ISODate; created_by: null }[] = [];
  const leaveDeletes: { userId: string; date: ISODate }[] = [];
  const auditRows: Record<string, unknown>[] = [];

  for (const row of parsed.rows) {
    const person = byName.get(normalise(row.player));
    if (!person) {
      if (row.cells.length) result.unmatchedPlayers.push(row.player);
      continue;
    }
    const expected = teamName.get(person.teamId ?? "") ?? "";
    if (row.team && normalise(row.team) !== normalise(expected)) {
      result.wrongTeam.push(`${row.player}: sheet says ${row.team}, portal says ${expected || "no team"}`);
    }
    for (const cell of row.cells) {
      if (cell.date > today) {
        result.skippedFuture++;
        continue;
      }
      const key = `${person.id}|${cell.date}`;
      const wasSteps = stepsNow.get(key) ?? null;
      const wasLeave = leaveNow.has(key);
      if (wasSteps === cell.steps && wasLeave === cell.leave) {
        result.unchanged++;
        continue;
      }
      if (cell.leave) {
        if (wasSteps !== null) entryDeletes.push({ userId: person.id, date: cell.date });
        if (!wasLeave) leaveInserts.push({ season_id: season.id, user_id: person.id, date: cell.date, created_by: null });
      } else {
        if (wasLeave) leaveDeletes.push({ userId: person.id, date: cell.date });
        entryUpserts.push({ season_id: season.id, user_id: person.id, date: cell.date, steps: cell.steps!, updated_by: null, updated_at: result.ranAt });
      }
      auditRows.push({
        actor_id: null,
        action: wasSteps === null && !wasLeave ? "create" : "update",
        entity: "step_entry",
        entity_key: key,
        before_json: { steps: wasSteps, leave: wasLeave },
        after_json: { steps: cell.steps, leave: cell.leave },
        note: "Google Sheet sync",
      });
      result.changed++;
    }
  }

  for (const d of entryDeletes) must(await db.from("step_entries").delete().eq("season_id", season.id).eq("user_id", d.userId).eq("date", d.date), "Clearing steps");
  for (const d of leaveDeletes) must(await db.from("leave_records").delete().eq("season_id", season.id).eq("user_id", d.userId).eq("date", d.date), "Clearing leave");
  for (let i = 0; i < entryUpserts.length; i += 500) must(await db.from("step_entries").upsert(entryUpserts.slice(i, i + 500)), "Saving steps");
  for (let i = 0; i < leaveInserts.length; i += 500) must(await db.from("leave_records").upsert(leaveInserts.slice(i, i + 500)), "Saving leave");
  for (let i = 0; i < auditRows.length; i += 500) must(await db.from("audit_log").insert(auditRows.slice(i, i + 500)), "Writing the audit log");

  if (result.changed > 0) await recomputeWith(db);
  return result;
}

export function describeSync(r: SyncResult): string {
  const bits = [r.changed === 0 ? "No changes: the portal already matches the sheet" : `Updated ${r.changed} ${r.changed === 1 ? "entry" : "entries"}`];
  if (r.unchanged) bits.push(`${r.unchanged} already matched`);
  if (r.skippedFuture) bits.push(`${r.skippedFuture} future ${r.skippedFuture === 1 ? "day" : "days"} skipped`);
  if (r.unmatchedPlayers.length) bits.push(`no match for ${[...new Set(r.unmatchedPlayers)].join(", ")}`);
  if (r.wrongTeam.length) bits.push(`team mismatch: ${[...new Set(r.wrongTeam)].join("; ")}`);
  if (r.problems.length) bits.push(`${r.problems.length} cell problem${r.problems.length === 1 ? "" : "s"}: ${r.problems.slice(0, 3).join(" ")}`);
  return `${bits.join(" · ")}.`;
}
