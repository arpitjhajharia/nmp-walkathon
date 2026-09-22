"use server";

import { revalidatePath } from "next/cache";
import { isValidISODate } from "@/lib/engine/dates";
import { requireAdmin } from "@/lib/server/auth";
import { dateProblem, findUser, listContacts, listTeams, saveDay, type DayRowInput } from "@/lib/server/data";
import { getPortal } from "@/lib/server/season";
import { pushToSheets, sheetsEnabled } from "@/lib/server/sheets";

export interface SaveState {
  ok: boolean;
  message: string;
  savedAt?: string;
  errors?: Record<string, string>;
}

export async function saveEntries(_prev: SaveState | null, formData: FormData): Promise<SaveState> {
  const admin = await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!isValidISODate(date)) return { ok: false, message: "That date isn't valid." };
  const problem = await dateProblem(date);
  if (problem) return { ok: false, message: problem };

  const members = (await getPortal()).season.rosterOn(teamId, date);
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
    const { changed } = await saveDay(teamId, date, rows);
    revalidatePath("/", "layout");
    if (changed > 0 && sheetsEnabled()) {
      const team = (await listTeams()).find((t) => t.id === teamId)?.name ?? "";
      const contacts = await listContacts();
      const sheetRows = await Promise.all(
        rows.map(async (r) => ({
          date,
          name: (await findUser(r.userId))?.name,
          email: contacts.get(r.userId)?.email,
          team,
          steps: r.steps ?? "",
          onLeave: r.leave ? "yes" : "",
          updatedBy: admin.name,
          updatedAt: new Date().toISOString(),
        })),
      );
      await pushToSheets("entries", sheetRows);
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
