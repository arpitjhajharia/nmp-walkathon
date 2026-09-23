// Reads daily steps from a Google Sheet. The sheet is the source of truth for step counts:
// a row per person, a column per day, as published by "Anyone with the link can view".
//
// Cell values: a number = that day's steps; "L" or "leave" = on leave; blank = nothing
// recorded yet (a blank never deletes what's already saved).

import { formatShort, type ISODate } from "../engine/dates.ts";

export interface SheetCell {
  date: ISODate;
  steps: number | null;
  leave: boolean;
}

export interface SheetRow {
  team: string;
  player: string;
  cells: SheetCell[];
}

export interface ParsedSheet {
  rows: SheetRow[];
  /** Sheet date headings that don't fall inside the season. */
  unknownDates: string[];
  problems: string[];
}

/** Minimal CSV reader (handles quotes, commas and newlines inside cells). */
export function parseCsv(text: string): string[][] {
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

const LEAVE = /^(l|leave|on leave|ool|off)$/i;

/** "22-Sep", "22 Sep", "2026-09-22" and "22/09/2026" all match a season date. */
function matchDate(heading: string, seasonDates: ISODate[]): ISODate | null {
  const h = heading.trim();
  if (!h) return null;
  if (seasonDates.includes(h)) return h;
  const compact = h.toLowerCase().replace(/[\s.]+/g, "-");
  for (const d of seasonDates) {
    const short = formatShort(d).toLowerCase(); // "22 Sep"
    const [day, mon] = short.split(" ");
    if (compact === `${day}-${mon}` || compact === `${day.padStart(2, "0")}-${mon}`) return d;
    const [y, m, dd] = d.split("-");
    if (compact === `${dd}/${m}/${y}` || compact === `${Number(dd)}/${Number(m)}/${y}`) return d;
  }
  return null;
}

export function parseSheet(csv: string, seasonDates: ISODate[]): ParsedSheet {
  const table = parseCsv(csv);
  const problems: string[] = [];
  if (table.length < 2) return { rows: [], unknownDates: [], problems: ["The sheet has no data rows."] };

  const header = table[0].map((h) => h.trim());
  const teamCol = header.findIndex((h) => /^team$/i.test(h));
  const playerCol = header.findIndex((h) => /^(player|name)$/i.test(h));
  if (teamCol < 0 || playerCol < 0) {
    return { rows: [], unknownDates: [], problems: ['The first row needs "Team" and "Player" headings.'] };
  }

  const dateOf = new Map<number, ISODate>();
  const unknownDates: string[] = [];
  header.forEach((h, i) => {
    if (i === teamCol || i === playerCol || !h) return;
    const d = matchDate(h, seasonDates);
    if (d) dateOf.set(i, d);
    else unknownDates.push(h);
  });
  if (dateOf.size === 0) problems.push("None of the date columns fall inside the season.");

  const rows: SheetRow[] = [];
  for (const [n, raw] of table.slice(1).entries()) {
    const player = (raw[playerCol] ?? "").trim();
    if (!player) continue;
    const cells: SheetCell[] = [];
    for (const [i, date] of dateOf) {
      const value = (raw[i] ?? "").trim();
      if (value === "") continue;
      if (LEAVE.test(value)) {
        cells.push({ date, steps: null, leave: true });
        continue;
      }
      const digits = value.replace(/[,\s]/g, "");
      if (!/^\d+$/.test(digits)) {
        problems.push(`Row ${n + 2} (${player}), ${header[i]}: "${value}" isn't a whole number of steps.`);
        continue;
      }
      cells.push({ date, steps: Number(digits), leave: false });
    }
    rows.push({ team: (raw[teamCol] ?? "").trim(), player, cells });
  }
  return { rows, unknownDates, problems };
}

export function sheetConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SHEET_ID);
}

export function sheetUrl(): string | null {
  const id = process.env.GOOGLE_SHEET_ID;
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

/** Download the sheet tab as CSV. The sheet must be shared as "Anyone with the link can view". */
export async function fetchSheetCsv(): Promise<string> {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("Set GOOGLE_SHEET_ID to the id in your sheet's web address.");
  const tab = process.env.GOOGLE_SHEET_TAB || "Data";
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
  if (!res.ok) throw new Error(`Google Sheets returned ${res.status}. Check the id and that link sharing is on.`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error('The sheet isn\'t readable. In Google Sheets choose Share → "Anyone with the link" → Viewer.');
  }
  return text;
}
