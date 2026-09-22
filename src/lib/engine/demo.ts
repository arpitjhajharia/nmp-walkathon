// Deterministic, realistic demo season: four teams of five, starting ~50 days before
// "today" so the demo always shows a season in full swing.

import { addDays, dateRange, diffDays, mondayOf, weekday, type ISODate } from "./dates.ts";
import { DEFAULT_SETTINGS } from "./defaults.ts";
import type { Challenge, ChallengeType, Entry, Leave, Settings } from "./types.ts";

export interface DemoTeam {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
}

export interface DemoMember {
  id: string;
  name: string;
  email: string;
  teamId: string | null;
  isLead: boolean;
  isAdmin: boolean;
}

export interface DemoData {
  settings: Settings;
  teams: DemoTeam[];
  members: DemoMember[];
  entries: Entry[];
  leaves: Leave[];
  challenges: Challenge[];
}

export const DEMO_DOMAIN = "office.example";
export const DEMO_PASSWORD = "walk2026";

export const DEMO_TEAMS: DemoTeam[] = [
  { id: "team-comets", slug: "comets", name: "Comets", color: "#1D4ED8", icon: "rocket" },
  { id: "team-striders", slug: "striders", name: "Striders", color: "#15803D", icon: "footprints" },
  { id: "team-blazers", slug: "blazers", name: "Blazers", color: "#C2410C", icon: "flame" },
  { id: "team-nomads", slug: "nomads", name: "Nomads", color: "#7E22CE", icon: "compass" },
];

const NAMES = [
  ["Priya Nair", "Aarav Mehta", "Sneha Iyer", "Rohan Kapoor", "Isha Gupta"],
  ["Vikram Singh", "Ananya Rao", "Karan Malhotra", "Divya Menon", "Arjun Reddy"],
  ["Meera Pillai", "Nikhil Joshi", "Kavya Sharma", "Rahul Verma", "Tanvi Desai"],
  ["Siddharth Bose", "Pooja Banerjee", "Aditya Kulkarni", "Neha Saxena", "Manish Chawla"],
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emailFor(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${DEMO_DOMAIN}`;
}

export function buildDemoData(today: ISODate): DemoData {
  const rand = mulberry32(20260803);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

  const startDate = mondayOf(addDays(today, -50));
  const settings: Settings = { ...DEFAULT_SETTINGS, startDate };

  const members: DemoMember[] = [
    { id: "user-admin", name: "Asha Fernandes", email: `wellness@${DEMO_DOMAIN}`, teamId: null, isLead: false, isAdmin: true },
  ];
  DEMO_TEAMS.forEach((t, ti) =>
    NAMES[ti].forEach((name, i) =>
      members.push({ id: `user-${t.slug}-${i + 1}`, name, email: emailFor(name), teamId: t.id, isLead: i === 0, isAdmin: false }),
    ),
  );

  const entries: Entry[] = [];
  const leaves: Leave[] = [];
  const dates = dateRange(startDate, Math.min(settings.lengthDays, diffDays(startDate, today) + 1));
  const participants = members.filter((m) => m.teamId);

  participants.forEach((m, idx) => {
    const base = 3600 + rand() * 8600;
    const trend = idx % 6 === 2 ? 45 + rand() * 30 : (rand() - 0.35) * 30; // a few genuine improvers
    const weekendFactor = 0.75 + rand() * 0.55;
    const bigDayChance = idx % 7 === 3 ? 0.12 : 0.02;
    const leaveStart = rand() < 0.35 ? Math.floor(rand() * (dates.length - 5)) : -1;
    const leaveLength = 2 + Math.floor(rand() * 4);

    dates.forEach((d, di) => {
      if (leaveStart >= 0 && di >= leaveStart && di < leaveStart + leaveLength) {
        leaves.push({ userId: m.id, date: d });
        return;
      }
      if (rand() < 0.012) return; // occasionally a lead forgets: a genuine gap, never auto-filled
      let steps = (base + trend * di) * (weekday(d) >= 5 ? weekendFactor : 1) * (1 + gauss() * 0.26);
      if (rand() < bigDayChance) steps += 9000 + rand() * 9000;
      if (rand() < 0.05) steps *= 0.45; // a rainy, desk-bound day
      entries.push({ userId: m.id, date: d, steps: Math.max(600, Math.round(steps / 10) * 10) });
    });
  });

  // Today's entries arrive through the day: one team done, one partial, one not started.
  const pendingToday = new Set([
    ...participants.filter((m) => m.teamId === "team-striders").slice(3).map((m) => m.id),
    ...participants.filter((m) => m.teamId === "team-blazers").map((m) => m.id),
  ]);
  const keep = (x: { userId: string; date: ISODate }) => !(x.date === today && pendingToday.has(x.userId));

  const cycle: ChallengeType[] = ["five_day_move", "weekend_walk", "ten_k_day", "streak_builder"];
  const weekCount = Math.ceil((diffDays(mondayOf(startDate), addDays(startDate, settings.lengthDays - 1)) + 1) / 7);
  const challenges: Challenge[] = Array.from({ length: weekCount }, (_, i) => ({ weekIndex: i, type: cycle[i % cycle.length] }));

  return {
    settings,
    teams: DEMO_TEAMS,
    members,
    entries: entries.filter(keep),
    leaves: leaves.filter(keep),
    challenges,
  };
}
