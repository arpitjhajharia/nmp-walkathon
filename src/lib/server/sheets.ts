// Optional Google Sheets backup. The database stays the source of truth; when
// GOOGLE_SHEETS_WEBHOOK_URL points at a Google Apps Script web app (see README),
// saved entries are pushed there for reporting. Failures never block a save.

export function sheetsEnabled(): boolean {
  return Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL);
}

export async function pushToSheets(kind: "entries" | "full", rows: Record<string, unknown>[]): Promise<{ ok: boolean; message: string }> {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) return { ok: false, message: "Google Sheets sync is not configured." };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: process.env.GOOGLE_SHEETS_SECRET ?? "", kind, rows }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, message: `Sheets responded with ${res.status}.` };
    return { ok: true, message: `Sent ${rows.length} row${rows.length === 1 ? "" : "s"} to Google Sheets.` };
  } catch (err) {
    console.error("[sheets] sync failed", err);
    return { ok: false, message: "Could not reach Google Sheets. Entries are safe in the portal database." };
  }
}
