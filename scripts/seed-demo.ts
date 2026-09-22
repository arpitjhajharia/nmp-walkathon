// npm run seed:demo — replace the season with demo data (asks for confirmation).
import { createInterface } from "node:readline/promises";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { seedDemo } from "../src/lib/server/seed.ts";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = process.argv.includes("--yes")
  ? "yes"
  : await rl.question("This replaces the season, teams, entries and audit log with demo data. Type 'yes' to continue: ");
rl.close();
if (answer.trim().toLowerCase() !== "yes") {
  console.log("Cancelled.");
  process.exit(0);
}
await seedDemo(createAdminClient(), (m) => console.log(m));
console.log("Done. Sign in as the demo admin (wellness@office.example) with the password walk2026.");
