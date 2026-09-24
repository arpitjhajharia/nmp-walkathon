import type { Settings } from "./types.ts";

export const DEFAULT_SETTINGS: Omit<Settings, "startDate"> = {
  seasonName: "Office Walkathon 2026",
  lengthDays: 100,
  timezone: "Asia/Kolkata",
  // The floor is one point, not zero: recording a quiet day still puts something on the
  // board for your team. The steps decide how much more you add on top.
  bands: [
    { min: 0, points: 1 },
    { min: 5000, points: 2 },
    { min: 8000, points: 3 },
    { min: 10000, points: 4 },
    { min: 12000, points: 5 },
  ],
  leaguePoints: { win: 2, draw: 1, loss: 0 },
  correctionDays: 1,
  teamSize: 5,
  finalSprintDays: 14,
  lockOlderDates: true,
  highValueWarning: 50000,
};
