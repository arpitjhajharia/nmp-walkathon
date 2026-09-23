// npm run backup — saves every table to backups/<timestamp>.json. Keep a copy off this Mac.
import { writeFileSync } from "node:fs";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
const db = createAdminClient();
const tables = ["seasons", "profiles", "teams", "team_members", "membership_history", "step_entries", "leave_records", "fixtures", "weekly_challenges", "league_standings", "fixture_results", "weekly_awards", "monthly_cups", "user_badges", "audit_log"];
const dump: Record<string, unknown[]> = {};
for (const t of tables) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(t).select("*").range(from, from + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  dump[t] = rows;
}
const file = `backups/walkathon-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
writeFileSync(file, JSON.stringify(dump, null, 2));
console.log("saved", file);
console.log(Object.entries(dump).map(([t, r]) => `${t}: ${r.length}`).join(" | "));
