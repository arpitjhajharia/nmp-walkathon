// Service-role client: bypasses row-level security. Server-only, and used for just three
// jobs: managing sign-in accounts, writing computed results, and seeding demo data.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceKey, supabaseUrl } from "./env.ts";

export function createAdminClient(): SupabaseClient {
  const key = supabaseServiceKey();
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY). See .env.example.");
  return createClient(supabaseUrl(), key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function hasServiceKey(): boolean {
  return supabaseServiceKey() !== null;
}
