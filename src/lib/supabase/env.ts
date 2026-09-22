// Supabase settings. Names match what the Vercel ↔ Supabase integration creates; the
// newer "publishable"/"secret" key names work too.

export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!v) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL. See .env.example.");
  return v;
}

export function supabasePublicKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!v) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). See .env.example.");
  return v;
}

/** Server-only. Never import this from client components. */
export function supabaseServiceKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE ?? "false") === "true";
}
