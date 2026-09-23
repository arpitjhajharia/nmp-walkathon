import { Download } from "lucide-react";
import { deleteLeave, resetDemo, syncSheets } from "@/app/actions/admin";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { Flash } from "@/components/flash";
import { Card, Chip, EmptyState, SectionTitle } from "@/components/ui";
import { formatDay } from "@/lib/engine/dates";
import { auditLog, leaveRecords } from "@/lib/server/data";
import { isDemoMode } from "@/lib/supabase/env";
import { getPortal } from "@/lib/server/season";
import { sheetConfigured, sheetUrl } from "@/lib/server/sheet";
import { ImportForm } from "./import-form";

// Resetting demo data or importing a large CSV can take a while.
export const maxDuration = 60;

export default async function DataAdmin({ searchParams }: PageProps<"/admin/data">) {
  const { nameOf } = await getPortal();
  const [leaves, recent] = await Promise.all([leaveRecords(25), auditLog(50, ["step_entry"])]);
  const lastSync = recent.find((r) => r.note === "Google Sheet sync");
  const tz = (await getPortal()).season.settings.timezone;

  return (
    <>
      <Flash searchParams={searchParams} />

      <section>
        <SectionTitle title="Leave records" sub="Most recent 25. Removing leave turns the day back into a normal (possibly missing) entry." />
        {leaves.length === 0 ? (
          <EmptyState title="No leave recorded" />
        ) : (
          <Card className="divide-y divide-line-2">
            {leaves.map((l) => (
              <div key={`${l.userId}-${l.date}`} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  <span className="font-semibold">{nameOf(l.userId)}</span> · {formatDay(l.date)}
                </span>
                <form action={deleteLeave}>
                  <input type="hidden" name="userId" value={l.userId} />
                  <input type="hidden" name="date" value={l.date} />
                  <button type="submit" className="min-h-9 rounded-lg px-3 text-sm font-semibold text-loss hover:bg-rose-50">Remove</button>
                </form>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle title="Import" />
          <Card className="p-5">
            <ImportForm />
          </Card>
        </div>
        <div>
          <SectionTitle title="Steps source & export" />
          <Card className="space-y-4 p-5">
            <a href="/api/export" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-night px-4 text-sm font-semibold text-white hover:bg-night-2">
              <Download className="size-4" aria-hidden="true" /> Download all entries (CSV)
            </a>
            <div className="border-t border-line-2 pt-4">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                Google Sheet {sheetConfigured() ? <Chip tone="good">Connected</Chip> : <Chip>Not configured</Chip>}
              </p>
              <p className="mt-1 text-xs text-muted">
                Steps come from the sheet: a row per person, a column per day. Blank cells change nothing; write <code>L</code> for a day on leave. It syncs automatically once a day, and you can pull the latest now.
              </p>
              {lastSync && (
                <p className="tnum mt-1 text-xs text-muted">
                  Last sync: {new Date(lastSync.at).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {sheetConfigured() && (
                  <form action={syncSheets}>
                    <SubmitButton variant="secondary">Sync steps from the sheet</SubmitButton>
                  </form>
                )}
                {sheetUrl() && (
                  <a href={sheetUrl()!} target="_blank" rel="noreferrer" className="text-sm font-semibold text-night-3 hover:underline">
                    Open the sheet →
                  </a>
                )}
              </div>
            </div>
          </Card>
        </div>
      </section>

      {isDemoMode() && (
        <section className="mt-10">
          <SectionTitle title="Demo mode" />
          <Card className="flex flex-wrap items-center justify-between gap-3 border-rose-200 p-5">
            <p className="max-w-xl text-sm text-muted">Reset replaces every team, member, entry and log with fresh sample data dated around today. Everyone is signed out. This option is hidden outside demo mode.</p>
            <form action={resetDemo}>
              <ConfirmSubmit message="Reset all demo data? Every change will be lost.">Reset demo data</ConfirmSubmit>
            </form>
          </Card>
        </section>
      )}
    </>
  );
}
