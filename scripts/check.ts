// npm run check — confirms .env.local points at a Supabase project with the walkathon
// schema applied: visitors can read, can't write, and never see emails.
import { createClient } from "@supabase/supabase-js";
import { supabasePublicKey, supabaseUrl } from "../src/lib/supabase/env.ts";
import { createAdminClient } from "../src/lib/supabase/admin.ts";

let ok = true;
const report = (label: string, pass: boolean, detail: string) => {
  ok &&= pass;
  console.log(`${pass ? "✓" : "✗"} ${label}: ${detail}`);
};

const url = new URL(supabaseUrl());
report("Project URL", url.pathname === "/" && url.hostname.endsWith(".supabase.co"), url.pathname === "/" ? url.hostname : `remove "${url.pathname}" from the end`);

const admin = createAdminClient();
const badges = await admin.from("badge_definitions").select("id");
report("Schema applied", !badges.error && badges.data.length === 8, badges.error ? badges.error.message : `${badges.data.length} badge definitions`);

const seasons = await admin.from("seasons").select("id, name").eq("is_active", true);
report("Active season", !seasons.error, seasons.error ? seasons.error.message : seasons.data.length ? seasons.data[0].name : "none yet (run npm run seed:demo or npm run setup)");

const users = await admin.auth.admin.listUsers({ perPage: 1 });
report("Account admin (secret key)", !users.error, users.error ? users.error.message : "ok");

const anon = createClient(supabaseUrl(), supabasePublicKey(), { auth: { persistSession: false } });
const pub = await anon.from("profiles").select("id");
const badKey = /api key/i.test(pub.error?.message ?? "");
report("Publishable/anon key", !badKey, badKey ? `${pub.error!.message}: copy it again from Project Settings → API Keys` : "accepted");
if (!badKey) {
  report("Visitors can read the competition", !pub.error, pub.error ? pub.error.message : `${pub.data?.length ?? 0} people visible`);
  const emails = await anon.from("profiles").select("email");
  report("Emails hidden from visitors", Boolean(emails.error), emails.error ? "no access" : "EMAILS ARE VISIBLE: apply the latest migration");
  const write = await anon.from("step_entries").insert({ season_id: "00000000-0000-0000-0000-000000000000", user_id: "00000000-0000-0000-0000-000000000000", date: "2026-01-01", steps: 1 });
  report("Visitors can't write", Boolean(write.error), write.error ? "blocked" : "WRITE ALLOWED");
  // member_contacts() exists only after the latest migration, and only signed-in admins may run it.
  const fn = await anon.rpc("member_contacts");
  const exists = /permission denied/i.test(fn.error?.message ?? "");
  report("Latest migration applied", exists, exists ? "ok" : `run the newest file in supabase/migrations (${fn.error?.message ?? "unexpected access"})`);
}

process.exit(ok ? 0 : 1);
