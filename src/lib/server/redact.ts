// Server-only. Failures from the Supabase client can quote the key that was sent, and
// those messages end up in a flash message on screen and in the hosting logs.

const SHAPES = [
  /\bsb_(?:secret|publishable)_[\w-]+/g, // current Supabase key format
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, // legacy JWT anon/service keys
];

/** Replace anything that looks like a key or token with a placeholder. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const raw of [process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, process.env.CRON_SECRET]) {
    const value = raw?.trim();
    // Short values would match far too much ordinary text.
    if (value && value.length >= 12) out = out.split(value).join("[key hidden]");
  }
  for (const shape of SHAPES) out = out.replace(shape, "[key hidden]");
  return out;
}

/** Error text that is safe to show an admin. */
export function safeMessage(e: unknown, fallback = "Something went wrong."): string {
  const message = e instanceof Error ? e.message : "";
  return message ? redactSecrets(message) : fallback;
}
