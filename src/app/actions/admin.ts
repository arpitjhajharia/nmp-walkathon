"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidISODate } from "@/lib/engine/dates";
import { CHALLENGE_TYPES } from "@/lib/engine/engine";
import type { Band, ChallengeType, Settings } from "@/lib/engine/types";
import { requireAdmin } from "@/lib/server/auth";
import {
  addMember,
  exportRows,
  getSettings,
  importRows,
  listContacts,
  listUsers,
  regenerateFixtures,
  removeLeave,
  setAdminAccess,
  setChallenge,
  setPassword,
  temporaryPassword,
  setWeekPairing,
  updateMember,
  updateSettings,
  updateTeam,
} from "@/lib/server/data";
import { seedDemo } from "@/lib/server/seed";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/env";
import { safeMessage } from "@/lib/server/redact";
import { describeSync, syncFromSheet } from "@/lib/server/sheet-sync";

const errText = safeMessage;

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
  await requireAdmin();
  const prev = await getSettings();
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
    lockOlderDates: false,
    highValueWarning: int(formData, "highValueWarning"),
  };
  if (!isValidISODate(next.startDate)) done("/admin/season", "Please choose a valid start date.", "err");
  const numbers = [next.lengthDays, next.leaguePoints.win, next.leaguePoints.draw, next.leaguePoints.loss, next.correctionDays, next.teamSize, next.finalSprintDays, next.highValueWarning];
  if (numbers.some((n) => Number.isNaN(n) || n < 0)) done("/admin/season", "Numbers must be whole numbers, 0 or more.", "err");
  if (next.lengthDays < 7 || next.lengthDays > 366) done("/admin/season", "A season must be between 7 and 366 days.", "err");
  if (next.finalSprintDays < 1 || next.finalSprintDays > next.lengthDays) done("/admin/season", "The Final Sprint must fit inside the season.", "err");
  let rebuilt = false;
  try {
    rebuilt = (await updateSettings(next)).rebuiltFixtures;
  } catch (e) {
    done("/admin/season", errText(e), "err");
  }
  done("/admin/season", rebuilt ? "Settings saved. The fixture schedule was rebuilt for the new dates." : "Settings saved. Scores recalculated.");
}

// ───────── Teams & members ─────────

export async function saveTeam(formData: FormData) {
  await requireAdmin();
  const teamId = str(formData, "teamId");
  const name = str(formData, "name");
  const color = str(formData, "color");
  if (!name) done("/admin/teams", "A team needs a name.", "err");
  if (!/^#[0-9a-f]{6}$/i.test(color)) done("/admin/teams", "Pick a team colour.", "err");
  const lead = str(formData, "leadUserId") || null;
  if (lead && (await listUsers()).find((u) => u.id === lead)?.teamId !== teamId) done("/admin/teams", "The captain must be a member of the team.", "err");
  try {
    await updateTeam(teamId, { name, color, icon: str(formData, "icon"), leadUserId: lead });
  } catch (e) {
    done("/admin/teams", errText(e), "err");
  }
  done("/admin/teams", `${name} saved.`);
}

export interface MemberState {
  ok: boolean;
  message: string;
  password?: string;
}

export async function createMember(_prev: MemberState | null, formData: FormData): Promise<MemberState> {
  await requireAdmin();
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Enter a name and a valid work email." };
  // Any email is fine here: people don't sign in. ALLOWED_EMAIL_DOMAIN only limits admin sign-in.
  if ([...(await listContacts()).values()].some((c) => c.email.toLowerCase() === email)) return { ok: false, message: "Someone already uses that email." };
  let password: string | null;
  try {
    ({ password } = await addMember({ name, email, teamId: str(formData, "teamId") || null, isAdmin: formData.get("isAdmin") === "on" }));
  } catch (e) {
    return { ok: false, message: errText(e) };
  }
  revalidatePath("/", "layout");
  if (password) return { ok: true, message: `${name} added as an admin. Share this temporary password with them privately:`, password };
  return { ok: true, message: `${name} added.` };
}

export async function saveMember(formData: FormData) {
  const admin = await requireAdmin();
  const userId = str(formData, "userId");
  const name = str(formData, "name");
  const email = str(formData, "email");
  if (!name || !email.includes("@")) done("/admin/teams", "A member needs a name and email.", "err");
  if (userId === admin.id && formData.get("active") !== "on") done("/admin/teams", "You can't deactivate your own account.", "err");
  try {
    await updateMember(userId, {
      name,
      email,
      teamId: str(formData, "teamId") || null,
      active: formData.get("active") === "on",
    });
  } catch (e) {
    done("/admin/teams", errText(e), "err");
  }
  done("/admin/teams", `${name} saved.`);
}

export async function resetPassword(_prev: MemberState | null, formData: FormData): Promise<MemberState> {
  await requireAdmin();
  const password = temporaryPassword();
  try {
    await setPassword(str(formData, "userId"), password);
  } catch (e) {
    return { ok: false, message: errText(e) };
  }
  return { ok: true, message: "New temporary password. They can change it under Account after signing in:", password };
}

export async function changeAdminAccess(_prev: MemberState | null, formData: FormData): Promise<MemberState> {
  const admin = await requireAdmin();
  const userId = str(formData, "userId");
  const grant = str(formData, "grant") === "yes";
  if (!grant && userId === admin.id) return { ok: false, message: "You can't remove your own admin access." };
  let password: string | null;
  try {
    ({ password } = await setAdminAccess(userId, grant));
  } catch (e) {
    return { ok: false, message: errText(e) };
  }
  revalidatePath("/", "layout");
  if (password) return { ok: true, message: "Admin access granted. Share this temporary password with them privately:", password };
  return { ok: true, message: grant ? "Admin access granted. They can sign in with their existing password." : "Admin access removed. They can no longer sign in." };
}

// ───────── Fixtures & challenges ─────────

export async function rebuildSchedule() {
  await requireAdmin();
  try {
    await regenerateFixtures();
  } catch (e) {
    done("/admin/schedule", errText(e), "err");
  }
  done("/admin/schedule", "Schedule regenerated. Results recalculated from the new pairings.");
}

export async function savePairing(formData: FormData) {
  await requireAdmin();
  const week = int(formData, "weekIndex");
  try {
    await setWeekPairing(week, str(formData, "opponentId"));
  } catch (e) {
    done("/admin/schedule", e instanceof Error ? e.message : "Could not update that week.", "err");
  }
  done("/admin/schedule", `Week ${week + 1} fixtures updated.`);
}

export async function saveChallenge(formData: FormData) {
  await requireAdmin();
  const week = int(formData, "weekIndex");
  const type = str(formData, "type");
  try {
    await setChallenge(week, type && type in CHALLENGE_TYPES ? (type as ChallengeType) : null);
  } catch (e) {
    done("/admin/schedule", errText(e), "err");
  }
  done("/admin/schedule", `Week ${week + 1} challenge ${type ? "set" : "removed"}.`);
}

// ───────── Data, locks & corrections ─────────

export async function deleteLeave(formData: FormData) {
  await requireAdmin();
  try {
    await removeLeave(str(formData, "userId"), str(formData, "date"));
  } catch (e) {
    done("/admin/data", errText(e), "err");
  }
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
  await requireAdmin();
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
  const result = await importRows(
    rows.map((r) => ({ date: (r[iDate] ?? "").trim(), email: (r[iEmail] ?? "").trim(), steps: r[iSteps] ?? "", leave: iLeave >= 0 ? r[iLeave] ?? "" : "" })),
  );
  revalidatePath("/", "layout");
  if (result.errors.length && result.imported === 0) return { ok: false, message: "Nothing was imported. Please fix these rows and try again:", errors: result.errors.slice(0, 20) };
  if (result.errors.length) return { ok: false, message: `Imported ${result.imported} changes, but some days were refused:`, errors: result.errors.slice(0, 20) };
  return { ok: true, message: `Imported ${result.imported} change${result.imported === 1 ? "" : "s"}. Everything has been recalculated.` };
}

export async function syncSheets() {
  await requireAdmin();
  try {
    const result = await syncFromSheet(createAdminClient());
    revalidatePath("/", "layout");
    done("/admin/data", describeSync(result), result.unmatchedPlayers.length || result.problems.length ? "err" : "ok");
  } catch (e) {
    done("/admin/data", errText(e, "Could not read the Google Sheet."), "err");
  }
}

export async function resetDemo() {
  await requireAdmin();
  if (!isDemoMode()) done("/admin/data", "Reset is only available in demo mode.", "err");
  try {
    await seedDemo(createAdminClient());
  } catch (e) {
    done("/admin/data", errText(e), "err");
  }
  done("/admin", "Demo data reset. Everything is dated around today again.");
}
