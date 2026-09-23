// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, mondayOf, weekday } from "./dates.ts";
import { DEFAULT_SETTINGS } from "./defaults.ts";
import { buildDemoData } from "./demo.ts";
import { computeSeason, generateFixtures, nextBand, pointsFor, todayInsight, weeklyRecap } from "./engine.ts";
import type { Entry, Leave, Member, Snapshot } from "./types.ts";

const bands = DEFAULT_SETTINGS.bands;

test("step bands", () => {
  assert.equal(pointsFor(0, bands), 0);
  assert.equal(pointsFor(4999, bands), 0);
  assert.equal(pointsFor(5000, bands), 1);
  assert.equal(pointsFor(7999, bands), 1);
  assert.equal(pointsFor(8000, bands), 2);
  assert.equal(pointsFor(10000, bands), 3);
  assert.equal(pointsFor(11999, bands), 3);
  assert.equal(pointsFor(12000, bands), 4);
  assert.equal(pointsFor(60000, bands), 4, "contribution is capped");
  assert.deepEqual(nextBand(8200, bands), { min: 10000, points: 3, gap: 1800 });
  assert.equal(nextBand(15000, bands), null);
});

test("fixtures rotate so every pair meets every three weeks", () => {
  const f = generateFixtures(["a", "b", "c", "d"], 15);
  assert.equal(f.length, 30);
  const pairs = new Map<string, number>();
  for (const x of f) {
    const k = [x.homeTeamId, x.awayTeamId].sort().join("-");
    pairs.set(k, (pairs.get(k) ?? 0) + 1);
  }
  assert.equal(pairs.size, 6);
  for (const n of pairs.values()) assert.equal(n, 5);
  for (let w = 0; w < 15; w++) {
    const teams = f.filter((x) => x.weekIndex === w).flatMap((x) => [x.homeTeamId, x.awayTeamId]);
    assert.equal(new Set(teams).size, 4, `week ${w} uses each team once`);
  }
});

function miniSnapshot(entries: Entry[], leaves: Leave[] = []): Snapshot {
  const start = "2026-08-03"; // Monday
  const teams = ["a", "b", "c", "d"].map((id) => ({ id, slug: id, name: `Team ${id.toUpperCase()}`, color: "#000", icon: "rocket", leadUserId: null }));
  const members: Member[] = teams.flatMap((t) =>
    [1, 2, 3, 4, 5].map((i) => ({ id: `${t.id}${i}`, name: `${t.id}${i}`, teamId: t.id, isAdmin: false, active: true })),
  );
  const fixtures = generateFixtures(["a", "b", "c", "d"], 15).map((f, i) => ({ ...f, id: `f${i}` }));
  return { settings: { ...DEFAULT_SETTINGS, startDate: start }, teams, members, entries, leaves, fixtures, challenges: [] };
}

test("daily team score, leave and missing entries", () => {
  const d = "2026-08-03";
  const s = computeSeason(
    miniSnapshot(
      [
        { userId: "a1", date: d, steps: 12500 },
        { userId: "a2", date: d, steps: 9000 },
        { userId: "a3", date: d, steps: 4000 },
      ],
      [{ userId: "a4", date: d }],
    ),
    "2026-08-04",
  );
  const td = s.teamDay("a", d);
  assert.equal(td.earned, 4 + 2 + 0);
  assert.equal(td.possible, 16, "on-leave member excluded from possible points");
  assert.equal(td.status, "partial", "a5 has no entry");
  assert.equal(s.memberDay("a5", d).points, 0, "missing entry earns nothing");
});

test("weekly fixture results feed standings with tie-breakers", () => {
  // Week 1 (3–9 Aug): fixtures a v d, b v c. a beats d; b and c draw.
  const entries: Entry[] = [
    { userId: "a1", date: "2026-08-03", steps: 12000 },
    { userId: "d1", date: "2026-08-03", steps: 8000 },
    { userId: "b1", date: "2026-08-04", steps: 10000 },
    { userId: "c1", date: "2026-08-04", steps: 10000 },
  ];
  const s = computeSeason(miniSnapshot(entries), "2026-08-11");
  const w1 = s.fixtures.filter((f) => f.week.index === 0);
  assert.equal(w1.length, 2);
  assert.ok(w1.every((f) => f.status === "completed"));
  const byTeam = Object.fromEntries(s.standings.map((r) => [r.teamId, r]));
  assert.equal(byTeam.a.points, 2);
  assert.equal(byTeam.b.points, 1);
  assert.equal(byTeam.c.points, 1);
  assert.equal(byTeam.d.points, 0);
  assert.equal(byTeam.a.position, 1);
  assert.equal(byTeam.b.position, 2, "b and c tied on everything share a position");
  assert.equal(byTeam.c.position, 2);
  assert.deepEqual(byTeam.a.form, ["W"]);
});

test("streaks pause on leave and break on a missed day", () => {
  const days = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"];
  const entries: Entry[] = [0, 1, 3, 4, 5].map((i) => ({ userId: "a1", date: days[i], steps: 6000 }));
  const s = computeSeason(miniSnapshot(entries, [{ userId: "a1", date: days[2] }]), "2026-08-11");
  const st = s.stats.get("a1")!;
  assert.equal(st.currentStreak, 0, "no entry on 9 Aug, and 10 Aug is the newest counted day → reset");
  assert.equal(st.bestStreak, 5);
  assert.equal(st.badges.find((b) => b.id === "streak_5")!.unlockedOn, days[5]);
});

test("a not-yet-synced newest day does not break a streak", () => {
  const days = ["2026-08-03", "2026-08-04", "2026-08-05"];
  // Today is 7 Aug, so 6 Aug counts but this morning's sync has not brought it in.
  const s = computeSeason(miniSnapshot(days.map((d) => ({ userId: "a1", date: d, steps: 7000 }))), "2026-08-07");
  assert.equal(s.lastCounted, "2026-08-06");
  assert.equal(s.stats.get("a1")!.currentStreak, 3);
});

test("scores stop at yesterday, and so do possible points", () => {
  const yesterday = "2026-08-04";
  const today = "2026-08-05";
  const s = computeSeason(
    miniSnapshot([
      { userId: "a1", date: yesterday, steps: 12000 },
      { userId: "a1", date: today, steps: 12000 },
    ]),
    today,
  );
  assert.equal(s.today, today);
  assert.equal(s.lastCounted, yesterday);
  assert.equal(s.countedDates.at(-1), yesterday);
  assert.equal(s.stats.get("a1")!.totalSteps, 12000, "today's steps wait for tomorrow");
  const f = s.fixtures.find((x) => x.week.index === 0 && (x.home.teamId === "a" || x.away.teamId === "a"))!;
  const a = f.home.teamId === "a" ? f.home : f.away;
  assert.equal(a.points, 4);
  assert.equal(a.possible, 40, "two counted days, five members, four points each");
});

test("day one has nothing to score yet", () => {
  const s = computeSeason(miniSnapshot([{ userId: "a1", date: "2026-08-03", steps: 12000 }]), "2026-08-03");
  assert.equal(s.phase, "live");
  assert.equal(s.dayNumber, 1);
  assert.equal(s.countedDates.length, 0);
  assert.equal(s.stats.get("a1")!.totalSteps, 0);
  assert.ok(todayInsight(s).length > 10);
});

test("weekly awards return joint winners on ties", () => {
  const entries: Entry[] = [
    { userId: "a1", date: "2026-08-03", steps: 9000 },
    { userId: "b1", date: "2026-08-03", steps: 9000 },
  ];
  const s = computeSeason(miniSnapshot(entries), "2026-08-10");
  const w = s.weeklyAwards.find((a) => a.weekIndex === 0)!;
  assert.equal(w.final, true);
  assert.deepEqual(w.mvp.map((x) => x.userId).sort(), ["a1", "b1"]);
});

test("demo season computes end to end", () => {
  const today = "2026-09-22";
  const demo = buildDemoData(today);
  assert.equal(weekday(demo.settings.startDate), 0);
  assert.equal(demo.settings.startDate, mondayOf(addDays(today, -50)));
  const snap: Snapshot = {
    settings: demo.settings,
    teams: demo.teams.map((t) => ({ ...t, leadUserId: demo.members.find((m) => m.teamId === t.id && m.isLead)!.id })),
    members: demo.members.map((m) => ({ ...m, active: true })),
    entries: demo.entries,
    leaves: demo.leaves,
    fixtures: generateFixtures(demo.teams.map((t) => t.id), 15).map((f, i) => ({ ...f, id: `f${i}` })),
    challenges: demo.challenges,
  };
  const s = computeSeason(snap, today);
  assert.equal(s.phase, "live");
  assert.equal(s.dayNumber, 51);
  assert.equal(s.participants.length, 20);
  assert.equal(s.currentWeek!.status, "live");
  assert.ok(s.standings[0].played > 0);
  const statuses = s.teams.map((t) => s.teamDay(t.id, today).status).sort();
  assert.deepEqual(statuses, ["complete", "complete", "none", "partial"]);
  assert.ok(s.leaderboards.improved.length > 0);
  assert.ok(todayInsight(s).length > 10);
  const recap = weeklyRecap(s, s.lastCompletedWeek!.index, (id) => id);
  assert.match(recap, /Week 7 recap/);
  assert.ok(s.monthlyCups.find((c) => c.status === "completed")!.winners.length >= 1);
});

test("pre-season and finished phases", () => {
  const pre = computeSeason(miniSnapshot([]), "2026-07-30");
  assert.equal(pre.phase, "pre");
  assert.equal(pre.countedDates.length, 0);
  assert.equal(pre.standings.every((r) => r.played === 0), true);
  assert.match(todayInsight(pre), /starts/);

  const entries: Entry[] = [{ userId: "b1", date: "2026-08-03", steps: 12000 }];
  const done = computeSeason(miniSnapshot(entries), "2026-12-01");
  assert.equal(done.phase, "finished");
  assert.equal(done.weeks.every((w) => w.status === "completed"), true);
  assert.deepEqual(done.champion, ["b"]);
  assert.equal(done.finalSprint.status, "completed");
  assert.equal(done.monthlyCups[0].winners[0], "b");
});

test("moving teams keeps past steps with the old team", () => {
  const snap = miniSnapshot([
    { userId: "a1", date: "2026-08-04", steps: 12000 },
    { userId: "a1", date: "2026-08-06", steps: 12000 },
  ]);
  // a1 moved from team a to team b on 6 Aug
  snap.members = snap.members.map((m) => (m.id === "a1" ? { ...m, teamId: "b" } : m));
  snap.memberships = [
    ...snap.members.filter((m) => m.id !== "a1").map((m) => ({ userId: m.id, teamId: m.teamId!, from: "2026-08-03", to: null })),
    { userId: "a1", teamId: "a", from: "2026-08-03", to: "2026-08-05" },
    { userId: "a1", teamId: "b", from: "2026-08-06", to: null },
  ];
  const s = computeSeason(snap, "2026-08-07");
  assert.equal(s.teamDay("a", "2026-08-04").earned, 4, "old team keeps the points");
  assert.equal(s.teamDay("b", "2026-08-04").earned, 0);
  assert.equal(s.teamDay("a", "2026-08-06").earned, 0);
  assert.equal(s.teamDay("b", "2026-08-06").earned, 4, "new team gets points from the move date");
  assert.equal(s.teamDay("a", "2026-08-06").possible, 16, "old team has four members after the move");
  assert.equal(s.teamDay("b", "2026-08-06").possible, 24);
  assert.equal(s.stats.get("a1")!.totalSteps, 24000, "personal totals follow the person");
});
