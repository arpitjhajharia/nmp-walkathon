// Runs every migration in an in-memory Postgres (PGlite) with a minimal stand-in for
// Supabase's auth schema, then checks the access rules as a visitor, a signed-in
// non-admin and an admin. Run with: npm run test:db
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("../migrations/", import.meta.url);
const migrations = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(new URL(f, dir), "utf8"));

const ids = {
  // sign-in accounts
  adminLogin: "00000000-0000-0000-0000-00000000aaaa",
  otherLogin: "00000000-0000-0000-0000-00000000bbbb",
  // people (profiles); the admin's profile id deliberately differs from their account id
  admin: "00000000-0000-0000-0000-00000000000a",
  a1: "00000000-0000-0000-0000-0000000000a1",
  a2: "00000000-0000-0000-0000-0000000000a2",
  b1: "00000000-0000-0000-0000-0000000000b1",
  season: "10000000-0000-0000-0000-000000000001",
  teamA: "20000000-0000-0000-0000-00000000000a",
  teamB: "20000000-0000-0000-0000-00000000000b",
};

const db = new PGlite();
let today = "";
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

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
  // The first migration expects profiles to reference auth.users, as on Supabase.
  await db.exec(migrations[0]);
  await db.exec(`insert into auth.users (id) values ('${ids.admin}')`);
  await db.exec(`insert into profiles (id, name, email, is_admin) values ('${ids.admin}', 'Admin', 'admin@x', true)`);
  for (const m of migrations.slice(1)) await db.exec(m);
  // Point the admin profile at a separate account id to prove the two are decoupled.
  await db.exec(`
    insert into auth.users (id) values ('${ids.adminLogin}'), ('${ids.otherLogin}');
    update profiles set auth_user_id = '${ids.adminLogin}' where id = '${ids.admin}';
  `);
  today = (await db.query<{ d: string }>("select (now() at time zone 'Asia/Kolkata')::date::text as d")).rows[0].d;
  await db.exec(`
    insert into profiles (id, name, email) values
      ('${ids.a1}', 'A One', 'a1@x'), ('${ids.a2}', 'A Two', 'a2@x'), ('${ids.b1}', 'B One', 'b1@x');
    insert into seasons (id, name, start_date, length_days, timezone, rules) values
      ('${ids.season}', 'Test', date '${today}' - 30, 100, 'Asia/Kolkata', '{"correctionDays": 1}');
    insert into teams (id, season_id, slug, name, color, icon, lead_user_id) values
      ('${ids.teamA}', '${ids.season}', 'a', 'A', '#000000', 'rocket', '${ids.a1}'),
      ('${ids.teamB}', '${ids.season}', 'b', 'B', '#000000', 'flame', '${ids.b1}');
    insert into team_members values
      ('${ids.season}', '${ids.a1}', '${ids.teamA}'), ('${ids.season}', '${ids.a2}', '${ids.teamA}'), ('${ids.season}', '${ids.b1}', '${ids.teamB}');
    insert into membership_history (season_id, user_id, team_id, from_date)
      select season_id, user_id, team_id, date '${today}' - 30 from team_members;
    insert into step_entries (season_id, user_id, date, steps) values ('${ids.season}', '${ids.a1}', date '${today}' - 3, 7000);
  `);
}

/** Run as a visitor (null), or as a signed-in account. */
async function as<T>(login: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${login ? "authenticated" : "anon"}; select set_config('request.jwt.claim.sub', '${login ?? ""}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}

const saveDay = (team: string, date: string, rows: object[]) =>
  db.query<{ n: number }>("select save_day($1, $2, $3::date, $4::jsonb) as n", [ids.season, team, date, JSON.stringify(rows)]).then((r) => r.rows[0].n);

test("migrations apply", async () => {
  await setup();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
});

test("visitors can read the competition without signing in", async () => {
  const entries = await as(null, () => db.query("select * from step_entries"));
  assert.equal(entries.rows.length, 1);
  const people = await as(null, () => db.query<{ name: string }>("select id, name, is_admin, active from profiles order by name"));
  assert.deepEqual(people.rows.map((p) => p.name), ["A One", "A Two", "Admin", "B One"]);
  for (const table of ["seasons", "teams", "fixtures", "league_standings", "membership_history"]) {
    await as(null, () => db.query(`select * from ${table}`));
  }
});

test("emails and the audit log stay private", async () => {
  await assert.rejects(as(null, () => db.query("select email from profiles")), /permission denied/);
  await assert.rejects(as(ids.otherLogin, () => db.query("select email from profiles")), /permission denied/);
  await assert.rejects(as(null, () => db.query("select * from audit_log")), /permission denied/);
  assert.equal((await as(ids.otherLogin, () => db.query("select * from audit_log"))).rows.length, 0);
  assert.equal((await as(ids.otherLogin, () => db.query("select * from member_contacts()"))).rows.length, 0);
  const contacts = await as(ids.adminLogin, () => db.query<{ email: string }>("select * from member_contacts()"));
  assert.equal(contacts.rows.length, 4);
});

test("visitors and non-admin accounts can't change anything", async () => {
  await assert.rejects(as(null, () => saveDay(ids.teamA, today, [{ userId: ids.a1, steps: 9000 }])), /permission denied/);
  await assert.rejects(as(null, () => db.query("insert into step_entries (season_id, user_id, date, steps) values ($1, $2, $3, 1)", [ids.season, ids.a2, today])), /permission denied/);
  await assert.rejects(as(ids.otherLogin, () => saveDay(ids.teamA, today, [{ userId: ids.a1, steps: 9000 }])), /Only admins/);
  await assert.rejects(
    as(ids.otherLogin, () => db.query("insert into step_entries (season_id, user_id, date, steps) values ($1, $2, $3, 1)", [ids.season, ids.a2, today])),
    /row-level security/,
  );
  const upd = await as(ids.otherLogin, () => db.query("update step_entries set steps = 1"));
  assert.equal(upd.affectedRows, 0);
  const prof = await as(ids.otherLogin, () => db.query("update profiles set is_admin = true"));
  assert.equal(prof.affectedRows, 0);
  await assert.rejects(as(ids.otherLogin, () => db.query("select set_member_team($1, $2, $3, $4::date)", [ids.season, ids.a2, ids.teamB, today])), /Admins only/);
  await assert.rejects(as(ids.otherLogin, () => db.query("select write_audit('x', 'y', 'z', null, null)")), /Admins only/);
});

test("admins save any day in the season up to today, audited under their profile", async () => {
  const n = await as(ids.adminLogin, () =>
    saveDay(ids.teamA, today, [
      { userId: ids.a1, steps: 9000 },
      { userId: ids.a2, steps: null, leave: true },
    ]),
  );
  assert.equal(n, 2);
  assert.equal(await as(ids.adminLogin, () => saveDay(ids.teamA, addDays(today, -20), [{ userId: ids.a1, steps: 6000 }])), 1, "old dates are fine for admins");
  await assert.rejects(as(ids.adminLogin, () => saveDay(ids.teamA, addDays(today, 1), [{ userId: ids.a1, steps: 1 }])), /Only admins/, "no future dates");
  await assert.rejects(as(ids.adminLogin, () => saveDay(ids.teamA, today, [{ userId: ids.b1, steps: 1 }])), /does not belong/);
  const entry = await db.query<{ updated_by: string }>("select updated_by from step_entries where user_id = $1 and date = $2", [ids.a1, today]);
  assert.equal(entry.rows[0].updated_by, ids.admin, "updated_by is the admin's profile, not their account id");
  const audit = await db.query<{ actor_id: string; n: number }>("select actor_id, count(*)::int as n from audit_log where entity = 'step_entry' group by actor_id");
  assert.deepEqual(audit.rows, [{ actor_id: ids.admin, n: 3 }]);
});

test("admin changes outside save_day are audited; service-role seeding is not", async () => {
  const count = async () => (await db.query<{ n: number }>("select count(*)::int as n from audit_log")).rows[0].n;
  const before = await count();
  const upd = await as(ids.adminLogin, () => db.query("update step_entries set steps = 7100 where user_id = $1 and date = $2", [ids.a1, addDays(today, -3)]));
  assert.equal(upd.affectedRows, 1);
  assert.equal(await count(), before + 1);
  await db.exec(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await db.exec(`insert into step_entries (season_id, user_id, date, steps) values ('${ids.season}', '${ids.b1}', '${addDays(today, -9)}', 4000)`);
  await db.exec(`select set_config('request.jwt.claims', '', false)`);
  assert.equal(await count(), before + 1);
});

test("moving a member keeps earlier days with the old team", async () => {
  await as(ids.adminLogin, () => db.query("select set_member_team($1, $2, $3, $4::date)", [ids.season, ids.a2, ids.teamB, today]));
  const hist = (await db.query<{ team_id: string; to_date: string | null }>(
    "select team_id, to_date::text from membership_history where user_id = $1 order by from_date", [ids.a2],
  )).rows;
  assert.deepEqual(hist.map((h) => h.team_id), [ids.teamA, ids.teamB]);
  assert.equal(hist[0].to_date, addDays(today, -1));
  assert.equal(await as(ids.adminLogin, () => saveDay(ids.teamA, addDays(today, -1), [{ userId: ids.a2, steps: 5500 }])), 1);
  await assert.rejects(as(ids.adminLogin, () => saveDay(ids.teamA, today, [{ userId: ids.a2, steps: 1 }])), /does not belong/);
});

test("admins manage people and settings; deactivated admins lose access", async () => {
  await as(ids.adminLogin, () => db.query("insert into profiles (name, email) values ('New Person', 'new@x')"));
  const newId = (await db.query<{ id: string }>("select id from profiles where email = 'new@x'")).rows[0].id;
  assert.ok(newId, "profile ids are generated; no sign-in account needed");
  const newStart = addDays(today, -40);
  await as(ids.adminLogin, () =>
    db.query("select update_season($1, 'Renamed', $2::date, 100, 'Asia/Kolkata', '{}'::jsonb, $3::jsonb, 15)", [
      ids.season, newStart, JSON.stringify([{ weekIndex: 0, homeTeamId: ids.teamA, awayTeamId: ids.teamB }]),
    ]),
  );
  assert.equal((await db.query<{ n: number }>("select count(*)::int as n from weekly_challenges")).rows[0].n, 15);
  await db.exec(`update profiles set active = false where id = '${ids.admin}'`);
  await assert.rejects(as(ids.adminLogin, () => saveDay(ids.teamA, today, [{ userId: ids.a1, steps: 1 }])), /Only admins/);
});
