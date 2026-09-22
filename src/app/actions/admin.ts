"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidISODate } from "@/lib/engine/dates";
import { CHALLENGE_TYPES } from "@/lib/engine/engine";
import type { Band, ChallengeType, Settings } from "@/lib/engine/types";
import { requireAdmin } from "@/lib/server/auth";
import {
  addMember,
  decideCorrection,
  exportRows,
  getSettings,
  importRows,
  listUsers,
  regenerateFixtures,
  removeLeave,
  seedDemo,
  setChallenge,
  setDateUnlocked,
  setPassword,
  setWeekPairing,
  updateMember,
  updateSettings,
  updateTeam,
} from "@/lib/server/data";
import { isDemoMode } from "@/lib/server/db";
import { temporaryPassword } from "@/lib/server/passwords";
import { pushToSheets } from "@/lib/server/sheets";

function done(path: string, message: string, tone: "ok" | "err" = "ok"): never {
  revalidatePath("/", "layout");
  redirect(`${path}?${tone}=${encodeURIComponent(message)}`);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[,\s]/g, "");
  return /^-?\d+$/.test(v) ? Number(v) : NaN;
};

// ───────── Season ─────────

export async function saveSeason(formData: FormData) {
  const admin = await requireAdmin();
  const prev = getSettings();
  const bands: Band[] = [];
  for (let i = 0; i < 8; i++) {
    if (!formData.has(`band_min_${i}`)) break;
    const min = int(formData, `band_min_${i}`);
    const points = int(formData, `band_points_${i}`);
    if (Number.isNaN(min) || Number.isNaN(points) || min < 0 || points < 0) done("/admin/season", "Every step band needs a whole-number threshold and points.", "err");
    bands.push({ min, points });
  }
  bands.sort((a, b) => a.min - b.min);
  if (bands[0]?.min !== 0) done("/admin/season", "The first band must start at 0 steps.", "err");
  if (bands.some((b, i) => i > 0 && (b.min === bands[i - 1].min || b.points < bands[i - 1].points))) {
    done("/admin/season", "Bands must have different thresholds and never give fewer points for more steps.", "err");
  }
  const timezone = str(formData, "timezone");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    done("/admin/season", `"${timezone}" isn't a recognised timezone. Try something like Asia/Kolkata.`, "err");
  }
  const next: Settings = {
    seasonName: str(formData, "seasonName") || prev.seasonName,
    startDate: str(formData, "startDate"),
    lengthDays: int(formData, "lengthDays"),
    timezone,
    bands,
    leaguePoints: { win: int(formData, "win"), draw: int(formData, "draw"), loss: int(formData, "loss") },
    correctionDays: int(formData, "correctionDays"),
    teamSize: int(formData, "teamSize"),
    finalSprintDays: int(formData, "finalSprintDays"),
    lockOlderDates: formData.get("lockOlderDates") === "on",
    highValueWarning: int(formData, "highValueWarning"),
  };
  if (!isValidISODate(next.startDate)) done("/admin/season", "Please choose a valid start date.", "err");
  const numbers = [next.lengthDays, next.leaguePoints.win, next.leaguePoints.draw, next.leaguePoints.loss, next.correctionDays, next.teamSize, next.finalSprintDays, next.highValueWarning];
  if (numbers.some((n) => Number.isNaN(n) || n < 0)) done("/admin/season", "Numbers must be whole numbers, 0 or more.", "err");
  if (next.lengthDays < 7 || next.lengthDays > 366) done("/admin/season", "A season must be between 7 and 366 days.", "err");
  if (next.finalSprintDays < 1 || next.finalSprintDays > next.lengthDays) done("/admin/season", "The Final Sprint must fit inside the season.", "err");
  updateSettings(admin.id, next);
  done("/admin/season", prev.startDate !== next.startDate || prev.lengthDays !== next.lengthDays ? "Settings saved. The fixture schedule was rebuilt for the new dates." : "Settings saved. Scores recalculated.");
}

// ───────── Teams & members ─────────

export async function saveTeam(formData: FormData) {
  const admin = await requireAdmin();
  const teamId = str(formData, "teamId");
  const name = str(formData, "name");
  const color = str(formData, "color");
  if (!name) done("/admin/teams", "A team needs a name.", "err");
  if (!/^#[0-9a-f]{6}$/i.test(color)) done("/admin/teams", "Pick a team colour.", "err");
  const lead = str(formData, "leadUserId") || null;
  if (lead && listUsers().find((u) => u.id === lead)?.teamId !== teamId) done("/admin/teams", "The team lead must be a member of the team.", "err");
  updateTeam(admin.id, teamId, { name, color, icon: str(formData, "icon"), leadUserId: lead });
  done("/admin/teams", `${name} saved.`);
}

export interface MemberState {
  ok: boolean;
  message: string;
  password?: string;
}

export async function createMember(_prev: MemberState | null, formData: FormData): Promise<MemberState> {
  const admin = await requireAdmin();
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Enter a name and a valid work email." };
  const domain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (domain && !email.endsWith(`@${domain.toLowerCase()}`)) return { ok: false, message: `Use an @${domain} email address.` };
  if (listUsers().some((u) => u.email.toLowerCase() === email)) return { ok: false, message: "Someone already uses that email." };
  const { password } = addMember(admin.id, { name, email, teamId: str(formData, "teamId") || null, isAdmin: formData.get("isAdmin") === "on" });
  revalidatePath("/", "layout");
  return { ok: true, message: `${name} added. Share this temporary password with them privately:`, password };
}

export async function saveMember(formData: FormData) {
  const admin = await requireAdmin();
  const userId = str(formData, "userId");
  const name = str(formData, "name");
  const email = str(formData, "email");
  if (!name || !email.includes("@")) done("/admin/teams", "A member needs a name and email.", "err");
  if (userId === admin.id && formData.get("isAdmin") !== "on") done("/admin/teams", "You can't remove your own admin access.", "err");
  updateMember(admin.id, userId, {
    name,
    email,
    teamId: str(formData, "teamId") || null,
    isAdmin: formData.get("isAdmin") === "on",
    active: formData.get("active") === "on",
  });
  done("/admin/teams", `${name} saved.`);
}

export async function resetPassword(_prev: MemberState | null, formData: FormData): Promise<MemberState> {
  const admin = await requireAdmin();
  const userId = str(formData, "userId");
  const password = temporaryPassword();
  setPassword(admin.id, userId, password);
  return { ok: true, message: "New temporary password (they'll be signed out everywhere):", password };
}

// ───────── Fixtures & challenges ─────────

export async function rebuildSchedule() {
  const admin = await requireAdmin();
  regenerateFixtures(admin.id);
  done("/admin/schedule", "Schedule regenerated. Results recalculated from the new pairings.");
}

export async function savePairing(formData: FormData) {
  const admin = await requireAdmin();
  const week = int(formData, "weekIndex");
  try {
    setWeekPairing(admin.id, week, str(formData, "opponentId"));
  } catch (e) {
    done("/admin/schedule", e instanceof Error ? e.message : "Could not update that week.", "err");
  }
  done("/admin/schedule", `Week ${week + 1} fixtures updated.`);
}

export async function saveChallenge(formData: FormData) {
  const admin = await requireAdmin();
  const week = int(formData, "weekIndex");
  const type = str(formData, "type");
  setChallenge(admin.id, week, type && type in CHALLENGE_TYPES ? (type as ChallengeType) : null);
  done("/admin/schedule", `Week ${week + 1} challenge ${type ? "set" : "removed"}.`);
}

// ───────── Data, locks & corrections ─────────

export async function unlockDate(formData: FormData) {
  const admin = await requireAdmin();
  const date = str(formData, "date");
  if (!isValidISODate(date)) done("/admin/data", "Choose a date to unlock.", "err");
  setDateUnlocked(admin.id, date, str(formData, "teamId") || "*", true);
  done("/admin/data", "Date unlocked for corrections.");
}

export async function lockDate(formData: FormData) {
  const admin = await requireAdmin();
  setDateUnlocked(admin.id, str(formData, "date"), str(formData, "teamId") || "*", false);
  done("/admin/data", "Date locked again.");
}

export async function decideRequest(formData: FormData) {
  const admin = await requireAdmin();
  const approve = str(formData, "decision") === "approve";
  decideCorrection(admin.id, str(formData, "id"), approve);
  done("/admin/data", approve ? "Approved: the date is unlocked for that team." : "Request declined.");
}

export async function deleteLeave(formData: FormData) {
  const admin = await requireAdmin();
  removeLeave(admin.id, str(formData, "userId"), str(formData, "date"));
  done("/admin/data", "Leave removed. That day now counts as a normal day for the member.");
}

export interface ImportState {
  ok: boolean;
  message: string;
  errors?: string[];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export async function importCsv(_prev: ImportState | null, formData: FormData): Promise<ImportState> {
  const admin = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CSV file first." };
  if (file.size > 2_000_000) return { ok: false, message: "That file is too large (2 MB max)." };
  const rows = parseCsv(await file.text());
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (n: string[]) => header.findIndex((h) => n.includes(h));
  const iDate = col(["date"]);
  const iEmail = col(["email"]);
  const iSteps = col(["steps"]);
  const iLeave = col(["on_leave", "leave"]);
  if (iDate < 0 || iEmail < 0 || iSteps < 0) return { ok: false, message: "The CSV needs date, email and steps columns (on_leave is optional)." };
  const result = importRows(
    { ...admin },
    rows.map((r) => ({ date: (r[iDate] ?? "").trim(), email: (r[iEmail] ?? "").trim(), steps: r[iSteps] ?? "", leave: iLeave >= 0 ? r[iLeave] ?? "" : "" })),
  );
  revalidatePath("/", "layout");
  if (result.errors.length) return { ok: false, message: "Nothing was imported. Please fix these rows and try again:", errors: result.errors.slice(0, 20) };
  return { ok: true, message: `Imported ${result.imported} change${result.imported === 1 ? "" : "s"}. Everything has been recalculated.` };
}

export async function syncSheets() {
  await requireAdmin();
  const res = await pushToSheets("full", exportRows());
  done("/admin/data", res.message, res.ok ? "ok" : "err");
}

export async function resetDemo() {
  const admin = await requireAdmin();
  if (!isDemoMode()) done("/admin/data", "Reset is only available in demo mode.", "err");
  void admin;
  seedDemo();
  revalidatePath("/", "layout");
  redirect("/login");
}
