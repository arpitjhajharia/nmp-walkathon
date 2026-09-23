// npm run sync:sheet — pull today's steps from the Google Sheet into the database.
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { describeSync, syncFromSheet } from "../src/lib/server/sheet-sync.ts";

const result = await syncFromSheet(createAdminClient());
console.log(describeSync(result));
for (const p of result.problems) console.log(" -", p);
if (result.unknownDates.length) console.log(" - ignored columns:", result.unknownDates.join(", "));
