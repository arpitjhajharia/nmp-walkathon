// Supabase settings. Names match what the Vercel ↔ Supabase integration creates; the
// newer "publishable"/"secret" key names work too.

/**
 * Values pasted into a hosting dashboard often pick up a stray space or line break, and
 * these go out as HTTP headers, where whitespace is illegal. Keys and URLs never contain
 * any, so drop it rather than fail with an unreadable error.
 */
function clean(...candidates: (string | undefined)[]): string | null {
  for (const v of candidates) {
    const value = v?.replace(/\s+/g, "");
    if (value) return value;
  }
  return null;
}

export function supabaseUrl(): string {
  const v = clean(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL);
  if (!v) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL. See .env.example.");
  return v;
}

export function supabasePublicKey(): string {
  const v = clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.SUPABASE_ANON_KEY);
  if (!v) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). See .env.example.");
  return v;
}

/** Server-only. Never import this from client components. */
export function supabaseServiceKey(): string | null {
  return clean(process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE ?? "false") === "true";
}
