// Scheduled sheet sync. Vercel's cron calls this at 11:00 India time (see vercel.json), by
// which point people have usually reported the previous day. It can also be triggered by
// hand with the CRON_SECRET.
import { describeSync, syncFromSheet } from "@/lib/server/sheet-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { sheetConfigured } from "@/lib/server/sheet";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  if (!sheetConfigured()) return Response.json({ ok: false, message: "GOOGLE_SHEET_ID isn't set." }, { status: 400 });
  try {
    const result = await syncFromSheet(createAdminClient());
    console.log("[sheet-sync]", describeSync(result));
    return Response.json({ ok: true, message: describeSync(result), ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    console.error("[sheet-sync]", message);
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
