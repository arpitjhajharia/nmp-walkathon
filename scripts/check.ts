// npm run check — confirms .env.local points at a Supabase project with the walkathon
// schema applied, and that signed-out visitors can't read anything.
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
if (!badKey) report("Signed-out visitors blocked", Boolean(pub.error) || pub.data?.length === 0, pub.error ? "no access" : `${pub.data?.length ?? 0} rows visible`);

process.exit(ok ? 0 : 1);
