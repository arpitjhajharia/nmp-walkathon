import type { Settings } from "./types.ts";

export const DEFAULT_SETTINGS: Omit<Settings, "startDate"> = {
  seasonName: "Office Walkathon 2026",
  lengthDays: 100,
  timezone: "Asia/Kolkata",
  bands: [
    { min: 0, points: 0 },
    { min: 5000, points: 1 },
    { min: 8000, points: 2 },
    { min: 10000, points: 3 },
    { min: 12000, points: 4 },
  ],
  leaguePoints: { win: 2, draw: 1, loss: 0 },
  correctionDays: 1,
  teamSize: 5,
  finalSprintDays: 14,
  lockOlderDates: true,
  highValueWarning: 50000,
};
