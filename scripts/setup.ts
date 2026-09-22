// npm run setup — first-time setup: creates your admin account and an empty season.
// Reads ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME from .env.local.
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { setupSeason } from "../src/lib/server/seed.ts";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local first.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}
await setupSeason(createAdminClient(), { email, password, name: process.env.ADMIN_NAME || "Walkathon Admin" }, (m) => console.log(m));
console.log("Done. Remove ADMIN_PASSWORD from .env.local now that the account exists.");
