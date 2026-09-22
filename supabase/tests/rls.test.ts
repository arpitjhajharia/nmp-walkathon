// Runs the migration in an in-memory Postgres (PGlite) with a minimal stand-in for
// Supabase's auth schema, then checks the access rules as different users.
// Run with: npm run test:db
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../migrations/20260922000000_walkathon.sql", import.meta.url), "utf8");

const ids = {
  admin: "00000000-0000-0000-0000-00000000000a",
  leadA: "00000000-0000-0000-0000-0000000000a1",
  memberA: "00000000-0000-0000-0000-0000000000a2",
  leadB: "00000000-0000-0000-0000-0000000000b1",
  memberB: "00000000-0000-0000-0000-0000000000b2",
  stranger: "00000000-0000-0000-0000-00000000ffff",
  season: "10000000-0000-0000-0000-000000000001",
  teamA: "20000000-0000-0000-0000-00000000000a",
  teamB: "20000000-0000-0000-0000-00000000000b",
};

const db = new PGlite();

async function setup() {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  await db.exec(migration);
  const today = (await db.query<{ d: string }>("select (now() at time zone 'Asia/Kolkata')::date::text as d")).rows[0].d;
  await db.exec(`
    insert into auth.users (id) values ('${ids.admin}'), ('${ids.leadA}'), ('${ids.memberA}'), ('${ids.leadB}'), ('${ids.memberB}'), ('${ids.stranger}');
    insert into profiles (id, name, email, is_admin) values
      ('${ids.admin}', 'Admin', 'admin@x', true), ('${ids.leadA}', 'Lead A', 'la@x', false), ('${ids.memberA}', 'Member A', 'ma@x', false),
      ('${ids.leadB}', 'Lead B', 'lb@x', false), ('${ids.memberB}', 'Member B', 'mb@x', false);
    insert into seasons (id, name, start_date, length_days, timezone, rules) values
      ('${ids.season}', 'Test', date '${today}' - 30, 100, 'Asia/Kolkata', '{"correctionDays": 1, "lockOlderDates": true}');
    insert into teams (id, season_id, slug, name, color, icon, lead_user_id) values
      ('${ids.teamA}', '${ids.season}', 'a', 'A', '#000000', 'rocket', '${ids.leadA}'),
      ('${ids.teamB}', '${ids.season}', 'b', 'B', '#000000', 'flame', '${ids.leadB}');
    insert into team_members values
      ('${ids.season}', '${ids.leadA}', '${ids.teamA}'), ('${ids.season}', '${ids.memberA}', '${ids.teamA}'),
      ('${ids.season}', '${ids.leadB}', '${ids.teamB}'), ('${ids.season}', '${ids.memberB}', '${ids.teamB}');
    insert into membership_history (season_id, user_id, team_id, from_date)
      select season_id, user_id, team_id, date '${today}' - 30 from team_members;
  `);
  return today;
}

async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? "authenticated" : "anon"}; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}

const saveDay = (team: string, date: string, rows: object[]) =>
  db.query<{ n: number }>("select save_day($1, $2, $3::date, $4::jsonb) as n", [ids.season, team, date, JSON.stringify(rows)]).then((r) => r.rows[0].n);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

let today = "";

test("migration applies", async () => {
  today = await setup();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
});

test("lead saves their own team's day, with one audit row per change", async () => {
  const n = await as(ids.leadA, () =>
    saveDay(ids.teamA, today, [
      { userId: ids.leadA, steps: 9000, leave: false },
      { userId: ids.memberA, steps: null, leave: true },
    ]),
  );
  assert.equal(n, 2);
  const again = await as(ids.leadA, () => saveDay(ids.teamA, today, [{ userId: ids.leadA, steps: 9000, leave: false }]));
  assert.equal(again, 0, "unchanged rows are skipped");
  const audit = await db.query("select * from audit_log where entity = 'step_entry'");
  assert.equal(audit.rows.length, 2, "save_day audits once per member, not per table write");
});

test("yesterday is editable, two days ago is locked", async () => {
  assert.equal(await as(ids.leadA, () => saveDay(ids.teamA, addDays(today, -1), [{ userId: ids.leadA, steps: 7000 }])), 1);
  await assert.rejects(as(ids.leadA, () => saveDay(ids.teamA, addDays(today, -2), [{ userId: ids.leadA, steps: 7000 }])), /locked/);
});

test("future dates are rejected even for admins", async () => {
  await assert.rejects(as(ids.admin, () => saveDay(ids.teamA, addDays(today, 1), [{ userId: ids.leadA, steps: 7000 }])), /locked/);
});

test("leads can't write for another team; participants can't write at all", async () => {
  await assert.rejects(as(ids.leadA, () => saveDay(ids.teamB, today, [{ userId: ids.memberB, steps: 7000 }])), /locked/);
  await assert.rejects(as(ids.leadA, () => saveDay(ids.teamA, today, [{ userId: ids.memberB, steps: 7000 }])), /does not belong/);
  await assert.rejects(as(ids.memberA, () => saveDay(ids.teamA, today, [{ userId: ids.memberA, steps: 7000 }])), /locked/);
});

test("direct table writes are held to the same rules", async () => {
  await assert.rejects(
    as(ids.memberA, () => db.query("insert into step_entries (season_id, user_id, date, steps) values ($1, $2, $3, 5000)", [ids.season, ids.memberA, today])),
    /row-level security/,
  );
  const upd = await as(ids.leadA, () =>
    db.query("update step_entries set steps = 1 where user_id = $1 and date = $2", [ids.leadA, addDays(today, -1)]),
  );
  assert.equal(upd.affectedRows, 1, "lead can update inside the window");
  await db.exec(`insert into step_entries (season_id, user_id, date, steps) values ('${ids.season}', '${ids.memberB}', '${addDays(today, -5)}', 4000)`);
  const locked = await as(ids.leadB, () =>
    db.query("update step_entries set steps = 99999 where user_id = $1 and date = $2", [ids.memberB, addDays(today, -5)]),
  );
  assert.equal(locked.affectedRows, 0, "locked rows can't be changed");
});

test("an admin unlock opens a locked date for that team only", async () => {
  const old = addDays(today, -5);
  await as(ids.admin, () => db.query("insert into unlocked_dates (season_id, date, team_id, unlocked_by) values ($1, $2, $3, $4)", [ids.season, old, ids.teamB, ids.admin]));
  assert.equal(await as(ids.leadB, () => saveDay(ids.teamB, old, [{ userId: ids.memberB, steps: 6000 }])), 1);
  await assert.rejects(as(ids.leadA, () => saveDay(ids.teamA, old, [{ userId: ids.memberA, steps: 6000 }])), /locked/);
});

test("correction requests: leads ask for their own team, admins decide", async () => {
  await as(ids.leadA, () =>
    db.query("insert into correction_requests (season_id, team_id, date, reason, requested_by) values ($1, $2, $3, 'typo fix', $4)", [ids.season, ids.teamA, addDays(today, -6), ids.leadA]),
  );
  await assert.rejects(
    as(ids.leadA, () =>
      db.query("insert into correction_requests (season_id, team_id, date, reason, requested_by) values ($1, $2, $3, 'sneaky', $4)", [ids.season, ids.teamB, today, ids.leadA]),
    ),
    /row-level security/,
  );
  const req = (await db.query<{ id: string }>("select id from correction_requests")).rows[0];
  await assert.rejects(as(ids.leadA, () => db.query("select decide_correction($1, true)", [req.id])), /Admins only/);
  await as(ids.admin, () => db.query("select decide_correction($1, true)", [req.id]));
  assert.equal(await as(ids.leadA, () => saveDay(ids.teamA, addDays(today, -6), [{ userId: ids.memberA, steps: 8000 }])), 1);
});

test("moving a member keeps earlier days with the old team", async () => {
  await assert.rejects(as(ids.leadA, () => db.query("select set_member_team($1, $2, $3, $4::date)", [ids.season, ids.memberA, ids.teamB, today])), /Admins only/);
  await as(ids.admin, () => db.query("select set_member_team($1, $2, $3, $4::date)", [ids.season, ids.memberA, ids.teamB, today]));
  const hist = (await db.query<{ team_id: string; from_date: string; to_date: string | null }>(
    "select team_id, from_date::text, to_date::text from membership_history where user_id = $1 order by from_date", [ids.memberA],
  )).rows;
  assert.equal(hist.length, 2);
  assert.equal(hist[0].team_id, ids.teamA);
  assert.equal(hist[0].to_date, addDays(today, -1));
  assert.equal(hist[1].team_id, ids.teamB);
  // Lead A can still correct yesterday for their former member; Lead B owns today.
  assert.equal(await as(ids.leadA, () => saveDay(ids.teamA, addDays(today, -1), [{ userId: ids.memberA, steps: 5500 }])), 1);
  assert.equal(await as(ids.leadB, () => saveDay(ids.teamB, today, [{ userId: ids.memberA, steps: 5600 }])), 1);
  await assert.rejects(as(ids.leadA, () => saveDay(ids.teamA, today, [{ userId: ids.memberA, steps: 1 }])), /does not belong/);
});

test("people without an active profile can't read anything", async () => {
  const stranger = await as(ids.stranger, () => db.query("select * from step_entries"));
  assert.equal(stranger.rows.length, 0);
  await assert.rejects(as(null, () => db.query("select * from profiles")), /permission denied/, "signed-out visitors have no table access at all");
  const member = await as(ids.memberB, () => db.query("select * from step_entries"));
  assert.ok(member.rows.length > 0);
  const audit = await as(ids.memberB, () => db.query("select * from audit_log"));
  assert.equal(audit.rows.length, 0, "only admins read the audit log");
  await assert.rejects(as(ids.memberB, () => db.query("insert into audit_log (action, entity, entity_key) values ('x','y','z')")), /row-level security/);
});

test("admin changes outside save_day are audited; service-role seeding is not", async () => {
  const before = (await db.query<{ n: number }>("select count(*)::int as n from audit_log")).rows[0].n;
  const upd = await as(ids.admin, () => db.query("update step_entries set steps = 4100 where user_id = $1 and date = $2", [ids.memberB, addDays(today, -5)]));
  assert.equal(upd.affectedRows, 1);
  const after = (await db.query<{ n: number; actor: string }>(
    "select (select count(*)::int from audit_log) as n, (select actor_id::text from audit_log order by id desc limit 1) as actor",
  )).rows[0];
  assert.equal(after.n, before + 1);
  assert.equal(after.actor, ids.admin);
  await db.exec(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await db.exec(`insert into step_entries (season_id, user_id, date, steps) values ('${ids.season}', '${ids.memberB}', '${addDays(today, -9)}', 4000)`);
  await db.exec(`select set_config('request.jwt.claims', '', false)`);
  assert.equal((await db.query<{ n: number }>("select count(*)::int as n from audit_log")).rows[0].n, before + 1);
});

test("non-admins can't change settings, teams or roles", async () => {
  await assert.rejects(
    as(ids.leadA, () => db.query("select update_season($1, 'x', current_date, 100, 'Asia/Kolkata', '{}'::jsonb)", [ids.season])),
    /Admins only/,
  );
  const r = await as(ids.leadA, () => db.query("update profiles set is_admin = true where id = $1", [ids.leadA]));
  assert.equal(r.affectedRows, 0);
  const t = await as(ids.leadA, () => db.query("update teams set lead_user_id = $1", [ids.memberA]));
  assert.equal(t.affectedRows, 0);
});

test("admin season update moves team history with the start date and rebuilds fixtures", async () => {
  const newStart = addDays(today, -40);
  await as(ids.admin, () =>
    db.query("select update_season($1, 'Renamed', $2::date, 100, 'Asia/Kolkata', '{\"correctionDays\":1}'::jsonb, $3::jsonb, 15)", [
      ids.season, newStart, JSON.stringify([{ weekIndex: 0, homeTeamId: ids.teamA, awayTeamId: ids.teamB }]),
    ]),
  );
  const firsts = await db.query<{ n: number }>("select count(*)::int as n from membership_history where from_date = $1", [newStart]);
  assert.equal(firsts.rows[0].n, 4);
  const ch = await db.query<{ n: number }>("select count(*)::int as n from weekly_challenges");
  assert.equal(ch.rows[0].n, 15);
  await assert.rejects(
    as(ids.admin, () => db.query("select update_season($1, 'x', current_date, 100, 'Not/AZone', '{}'::jsonb)", [ids.season])),
    /time zone/,
  );
});
