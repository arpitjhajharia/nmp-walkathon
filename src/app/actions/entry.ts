"use server";

import { revalidatePath } from "next/cache";
import { isValidISODate } from "@/lib/engine/dates";
import { requireUser } from "@/lib/server/auth";
import { editPermission, findUser, listTeams, listUsers, requestCorrection, saveDay, type DayRowInput } from "@/lib/server/data";
import { pushToSheets, sheetsEnabled } from "@/lib/server/sheets";

export interface SaveState {
  ok: boolean;
  message: string;
  savedAt?: string;
  errors?: Record<string, string>;
}

export async function saveEntries(_prev: SaveState | null, formData: FormData): Promise<SaveState> {
  const user = await requireUser();
  const teamId = String(formData.get("teamId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!isValidISODate(date)) return { ok: false, message: "That date isn't valid." };
  const perm = editPermission(user, teamId, date);
  if (!perm.editable) return { ok: false, message: perm.reason };

  const members = listUsers().filter((u) => u.teamId === teamId && u.active);
  const rows: DayRowInput[] = [];
  const errors: Record<string, string> = {};
  for (const m of members) {
    const leave = formData.get(`leave_${m.id}`) === "on";
    const raw = String(formData.get(`steps_${m.id}`) ?? "").replace(/[,\s]/g, "");
    if (leave) {
      rows.push({ userId: m.id, steps: null, leave: true });
      continue;
    }
    if (raw === "") {
      rows.push({ userId: m.id, steps: null, leave: false });
      continue;
    }
    if (!/^\d+$/.test(raw)) {
      errors[m.id] = "Use a whole number of steps, 0 or more.";
      continue;
    }
    rows.push({ userId: m.id, steps: Number(raw), leave: false });
  }
  if (Object.keys(errors).length) return { ok: false, message: "Please fix the highlighted rows.", errors };

  try {
    const { changed, saved } = saveDay(user, teamId, date, rows);
    revalidatePath("/", "layout");
    if (changed > 0 && sheetsEnabled()) {
      const team = listTeams().find((t) => t.id === teamId)?.name ?? "";
      void pushToSheets(
        "entries",
        saved.map((r) => {
          const u = findUser(r.userId);
          return { date: r.date, name: u?.name, email: u?.email, team, steps: r.steps ?? "", onLeave: r.leave ? "yes" : "", updatedBy: user.name, updatedAt: new Date().toISOString() };
        }),
      );
    }
    const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return {
      ok: true,
      message: changed === 0 ? "No changes: everything was already saved." : `Saved ${changed} ${changed === 1 ? "entry" : "entries"}. Scores and standings are updated.`,
      savedAt: time,
    };
  } catch (err) {
    console.error(err);
    return { ok: false, message: err instanceof Error ? err.message : "Something went wrong. Nothing was saved." };
  }
}

export async function submitCorrectionRequest(_prev: SaveState | null, formData: FormData): Promise<SaveState> {
  const user = await requireUser();
  const teamId = String(formData.get("teamId") ?? "");
  const date = String(formData.get("date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (user.leadTeamId !== teamId) return { ok: false, message: "Only the team lead can request a correction." };
  if (!isValidISODate(date)) return { ok: false, message: "That date isn't valid." };
  if (reason.length < 5) return { ok: false, message: "Please add a short reason so the admin knows what to fix." };
  requestCorrection(user, teamId, date, reason.slice(0, 500));
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Request sent. You'll be able to edit this date once an admin unlocks it." };
}
