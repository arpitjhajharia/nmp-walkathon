// Run with: npm run test:sheet
import assert from "node:assert/strict";
import { test } from "node:test";
import { dateRange } from "../engine/dates.ts";
import { parseSheet } from "./sheet.ts";

const season = dateRange("2026-09-22", 100);

test("reads steps, leave and blanks", () => {
  const csv = `"Team","Player","22-Sep","23-Sep","24-Sep"
"Sunrisers","Nikki Nalekar","388","7,092",""
"Titans","Arpit Jhajharia","2814","L","9063"`;
  const { rows, problems } = parseSheet(csv, season);
  assert.equal(problems.length, 0);
  assert.deepEqual(rows[0].cells, [
    { date: "2026-09-22", steps: 388, leave: false },
    { date: "2026-09-23", steps: 7092, leave: false },
  ]);
  assert.deepEqual(rows[1].cells[1], { date: "2026-09-23", steps: null, leave: true });
  assert.equal(rows[0].team, "Sunrisers");
});

test("accepts other date spellings and reports ones outside the season", () => {
  const csv = `Team,Player,22 Sep,2026-09-23,24/09/2026,1-Jan,Notes
Titans,Gauri Amin,1000,2000,3000,4000,hello`;
  const { rows, unknownDates } = parseSheet(csv, season);
  assert.deepEqual(rows[0].cells.map((c) => c.date), ["2026-09-22", "2026-09-23", "2026-09-24"]);
  assert.deepEqual(unknownDates, ["1-Jan", "Notes"]);
});

test("reports bad values without dropping the rest of the row", () => {
  const csv = `Team,Player,22-Sep,23-Sep
Titans,Gauri Amin,oops,5000`;
  const { rows, problems } = parseSheet(csv, season);
  assert.match(problems[0], /Gauri Amin/);
  assert.deepEqual(rows[0].cells, [{ date: "2026-09-23", steps: 5000, leave: false }]);
});

test("rejects a sheet without the right headings", () => {
  const { problems } = parseSheet("A,B\n1,2", season);
  assert.match(problems[0], /Team.*Player/);
});
