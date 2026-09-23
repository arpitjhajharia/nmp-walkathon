import { CalendarClock, ClipboardList, Footprints, Users } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/client";
import { Flash } from "@/components/flash";
import { TeamBadge } from "@/components/team";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { addDays, formatDay, formatRange } from "@/lib/engine/dates";
import { weeklyRecap } from "@/lib/engine/engine";
import { getPortal } from "@/lib/server/season";

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const { season: s, nameOf } = await getPortal();
  const completed = s.weeks.filter((w) => w.status === "completed");
  const weekParam = Number(sp.week);
  const recapWeek = Number.isInteger(weekParam) && s.weeks[weekParam - 1] ? s.weeks[weekParam - 1] : completed[completed.length - 1];
  const recap = recapWeek ? weeklyRecap(s, recapWeek.index, nameOf) : null;
  const yesterday = addDays(s.today, -1);
  const statusDays = [yesterday, s.today].filter((d) => d >= s.start && d <= s.end);

  return (
    <>
      <Flash searchParams={searchParams} />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: CalendarClock, label: "Season", value: s.phase === "live" ? `Day ${s.dayNumber} / ${s.settings.lengthDays}` : s.phase === "pre" ? "Not started" : "Finished", href: "/admin/season" },
          { icon: Users, label: "Participants", value: `${s.participants.length} in ${s.teams.length} teams`, href: "/admin/teams" },
          {
            icon: Footprints,
            label: "Steps in for today",
            value: `${s.participants.filter((m) => { const d = s.memberDay(m.id, s.today); return d.leave || d.steps !== null; }).length} / ${s.participants.length}`,
            href: "/admin/data",
          },
        ].map((x) => (
          <Link key={x.label} href={x.href} className="rounded-2xl border border-line bg-surface p-4 hover:shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              <x.icon className="size-3.5" aria-hidden="true" /> {x.label}
            </p>
            <p className="mt-1 font-display text-2xl font-bold">{x.value}</p>
          </Link>
        ))}
      </div>

      {statusDays.length > 0 && (
        <section className="mt-8">
          <SectionTitle title="Entry status" sub="Steps arrive from the Google Sheet. A gap means nobody has filled that day in yet." />
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  <th scope="col" className="px-4 py-2.5">Team</th>
                  {statusDays.map((d) => (
                    <th key={d} scope="col" className="px-4 py-2.5">{formatDay(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.teams.map((t) => (
                  <tr key={t.id} className="border-b border-line-2 last:border-0">
                    <td className="px-4 py-2.5">
                      <TeamBadge team={t} size="sm" />
                      <span className="ml-2 text-xs text-muted">{t.leadUserId ? nameOf(t.leadUserId) : "No lead"}</span>
                    </td>
                    {statusDays.map((d) => {
                      const td = s.teamDay(t.id, d);
                      return (
                        <td key={d} className="px-4 py-2.5">
                          <Chip tone={td.status === "complete" ? "good" : td.status === "partial" ? "warn" : "neutral"}>
                            {td.status === "complete" ? "Complete" : td.status === "partial" ? `Partial ${td.recorded}/${td.members}` : "Not entered"}
                          </Chip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <section className="mt-8">
        <SectionTitle title="Weekly recap" sub="Copy and paste into the office chat." />
        {recap && recapWeek ? (
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <nav aria-label="Recap week" className="flex flex-wrap gap-1">
                {s.weeks
                  .filter((w) => w.status !== "upcoming")
                  .map((w) => (
                    <Link
                      key={w.index}
                      href={`/admin?week=${w.number}`}
                      aria-current={w.index === recapWeek.index ? "true" : undefined}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${w.index === recapWeek.index ? "bg-night text-white" : "bg-line-2 text-muted hover:text-ink"}`}
                    >
                      W{w.number}
                    </Link>
                  ))}
              </nav>
              <CopyButton text={recap} label="Copy recap" />
            </div>
            <p className="mb-2 text-xs text-muted">
              Week {recapWeek.number} · {formatRange(recapWeek.start, recapWeek.end)}
              {recapWeek.status === "live" && " · in progress"}
            </p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-line-2 p-4 font-sans text-sm leading-relaxed text-ink-2">{recap}</pre>
          </Card>
        ) : (
          <p className="text-sm text-muted">The first recap is ready after week 1.</p>
        )}
      </section>

      <section className="mt-8">
        <SectionTitle title="Quick links" />
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            ["/admin/data", "Pull the latest steps from the Google Sheet"],
            ["/admin/schedule", "Pick next week's challenge"],
            ["/admin/teams", "Add a member, change a captain or give admin access"],
            ["/admin/audit", "See who changed what"],
          ].map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold hover:bg-line-2">
                <ClipboardList className="size-4 text-muted" aria-hidden="true" /> {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
