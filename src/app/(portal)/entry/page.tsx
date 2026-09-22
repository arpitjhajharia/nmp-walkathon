import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TeamBadge } from "@/components/team";
import { Chip, Notice, PageHeader } from "@/components/ui";
import { addDays, formatDay, isValidISODate } from "@/lib/engine/dates";
import { requireAdmin } from "@/lib/server/auth";
import { getPortal } from "@/lib/server/season";
import { EntryForm, type EntryRow } from "./entry-form";

export const metadata: Metadata = { title: "Enter steps" };

export default async function EntryPage({ searchParams }: PageProps<"/entry">) {
  await requireAdmin();
  const sp = await searchParams;
  const { season: s, entryMeta, nameOf } = await getPortal();
  const lastDay = s.today < s.end ? s.today : s.end;
  const requested = typeof sp.date === "string" && isValidISODate(sp.date) ? sp.date : lastDay;
  const date = requested < s.start ? s.start : requested > lastDay ? lastDay : requested;
  const team = s.teams.find((t) => t.id === sp.team) ?? s.teams[0];

  if (s.phase === "pre") {
    return (
      <>
        <PageHeader eyebrow="Daily entry" title="Enter steps" />
        <Notice>The season starts on {formatDay(s.start)}. Entry opens on day one.</Notice>
      </>
    );
  }
  if (!team) return <Notice tone="warn">No teams are set up yet. Add them under Admin → Teams & members.</Notice>;

  // Whoever was on the team that day, including people who have since moved.
  const members = [...s.rosterOn(team.id, date)].sort((a, b) => a.name.localeCompare(b.name));
  const yesterday = addDays(date, -1);
  const rows: EntryRow[] = members.map((m) => {
    const d = s.memberDay(m.id, date);
    const y = yesterday >= s.start ? s.memberDay(m.id, yesterday) : null;
    return { userId: m.id, name: m.name, isLead: m.id === team.leadUserId, steps: d.steps, leave: d.leave, yesterday: y?.steps ?? null, yesterdayLeave: y?.leave ?? false };
  });
  const lastEdit = members
    .map((m) => entryMeta.get(`${m.id}|${date}`))
    .filter((x) => x !== undefined)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const link = (d: string, t = team.id) => `/entry?date=${d}&team=${t}`;
  const nextTeam = s.teams[(s.teams.findIndex((t) => t.id === team.id) + 1) % s.teams.length];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Daily entry" title="Enter steps" />

      <nav aria-label="Choose team" className="mb-4 flex flex-wrap gap-2">
        {s.teams.map((t) => {
          const status = s.teamDay(t.id, date).status;
          return (
            <Link
              key={t.id}
              href={link(date, t.id)}
              aria-current={t.id === team.id ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2 ring-1 ${t.id === team.id ? "bg-surface ring-night" : "ring-line hover:bg-surface"}`}
            >
              <TeamBadge team={t} size="sm" />
              <span className={`size-2 rounded-full ${status === "complete" ? "bg-win" : status === "partial" ? "bg-amber-500" : "bg-line"}`} aria-hidden="true" />
              <span className="sr-only">{status === "complete" ? "complete" : status === "partial" ? "partly entered" : "not entered"}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-2">
        {prev >= s.start ? (
          <Link href={link(prev)} className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-line-2" aria-label={`Previous day, ${formatDay(prev)}`}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="size-11" />
        )}
        <form className="flex flex-col items-center" action="/entry">
          <input type="hidden" name="team" value={team.id} />
          <label htmlFor="date" className="sr-only">Date</label>
          <p className="font-display text-xl font-bold uppercase">{date === s.today ? `Today · ${formatDay(date)}` : formatDay(date)}</p>
          <input id="date" name="date" type="date" min={s.start} max={lastDay} defaultValue={date} className="text-xs text-muted" />
          <button type="submit" className="sr-only">Go to date</button>
        </form>
        {next <= lastDay ? (
          <Link href={link(next)} className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-line-2" aria-label={`Next day, ${formatDay(next)}`}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="size-11" />
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <TeamBadge team={team} size="sm" />
        {date < addDays(s.today, -s.settings.correctionDays) && <Chip tone="info">Correcting a past day</Chip>}
        {lastEdit && <span className="text-xs text-muted">Last saved by {nameOf(lastEdit.updatedBy)}</span>}
      </div>

      <EntryForm
        key={`${team.id}-${date}`}
        teamId={team.id}
        date={date}
        rows={rows}
        bands={s.settings.bands}
        maxDaily={s.maxDaily}
        highValue={s.settings.highValueWarning}
        teamColor={team.color}
        hasYesterday={rows.some((r) => r.yesterday !== null)}
      />

      {s.teams.length > 1 && (
        <p className="mt-4 text-center text-sm">
          <Link href={link(date, nextTeam.id)} className="font-semibold text-night-3 hover:underline">
            Next team: {nextTeam.name} →
          </Link>
        </p>
      )}

      <section className="mt-10" aria-labelledby="status-h">
        <h2 id="status-h" className="mb-2 font-display text-lg font-bold uppercase">Entry status · {formatDay(date)}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {s.teams.map((t) => {
            const td = s.teamDay(t.id, date);
            return (
              <li key={t.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5">
                <TeamBadge team={t} size="sm" />
                <Chip tone={td.status === "complete" ? "good" : td.status === "partial" ? "warn" : "neutral"}>
                  {td.status === "complete" ? "Complete" : td.status === "partial" ? `Partial · ${td.recorded}/${td.members}` : "Not entered"}
                </Chip>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
