import { ChevronLeft, ChevronRight, Lock, Unlock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TeamBadge } from "@/components/team";
import { Chip, Notice, PageHeader, fmt } from "@/components/ui";
import { addDays, diffDays, formatDay, isValidISODate, nowInTz } from "@/lib/engine/dates";
import { canEnterSteps, requireUser } from "@/lib/server/auth";
import { correctionRequests, editPermission, entriesForDate } from "@/lib/server/data";
import { getPortal } from "@/lib/server/season";
import { EntryForm, type EntryRow } from "./entry-form";
import { CorrectionRequest, Deadline } from "./extras";

export const metadata: Metadata = { title: "Enter steps" };

export default async function EntryPage({ searchParams }: PageProps<"/entry">) {
  const user = await requireUser();
  if (!canEnterSteps(user)) redirect("/");
  const sp = await searchParams;
  const { season: s, nameOf } = await getPortal();
  const lastDay = s.today < s.end ? s.today : s.end;
  const requested = typeof sp.date === "string" && isValidISODate(sp.date) ? sp.date : lastDay;
  const date = requested < s.start ? s.start : requested > lastDay ? lastDay : requested;
  const teamId = user.isAdmin && typeof sp.team === "string" && s.teams.some((t) => t.id === sp.team) ? sp.team : (user.leadTeamId ?? s.teams[0]?.id);
  const team = s.teams.find((t) => t.id === teamId);

  if (s.phase === "pre") {
    return (
      <>
        <PageHeader eyebrow="Daily entry" title="Enter steps" />
        <Notice>The season starts on {formatDay(s.start)}. Entry opens on day one.</Notice>
      </>
    );
  }
  if (!team) return <Notice tone="warn">No team is set up yet. An admin can add teams under Admin → Teams.</Notice>;

  const perm = await editPermission(user, team.id, date);
  const members = [...s.rosterOn(team.id, date)].sort((a, b) => (a.id === team.leadUserId ? -1 : b.id === team.leadUserId ? 1 : a.name.localeCompare(b.name)));
  const yesterday = addDays(date, -1);
  const memberIds = new Set(members.map((m) => m.id));
  const meta = new Map((await entriesForDate(date)).filter((e) => memberIds.has(e.userId)).map((e) => [e.userId, e]));
  const rows: EntryRow[] = members.map((m) => {
    const d = s.memberDay(m.id, date);
    const y = yesterday >= s.start ? s.memberDay(m.id, yesterday) : null;
    return { userId: m.id, name: m.name, isLead: m.id === team.leadUserId, steps: d.steps, leave: d.leave, yesterday: y?.steps ?? null, yesterdayLeave: y?.leave ?? false };
  });
  const lastEdit = [...meta.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  const pending = (await correctionRequests("pending")).find((r) => r.teamId === team.id && r.date === date);

  const now = nowInTz(s.settings.timezone);
  const minutesLeft = perm.editable && !user.isAdmin && !perm.unlockedByAdmin ? (s.settings.correctionDays - diffDays(date, s.today)) * 1440 + (1440 - (now.hour * 60 + now.minute)) : null;
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const link = (d: string) => `/entry?date=${d}${user.isAdmin ? `&team=${team.id}` : ""}`;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Daily entry" title="Enter steps" />

      {user.isAdmin && (
        <nav aria-label="Choose team" className="mb-4 flex flex-wrap gap-2">
          {s.teams.map((t) => (
            <Link key={t.id} href={`/entry?date=${date}&team=${t.id}`} aria-current={t.id === team.id ? "page" : undefined} className={`rounded-full py-1 pl-1 pr-3 ring-1 ${t.id === team.id ? "bg-surface ring-night" : "ring-line hover:bg-surface"}`}>
              <TeamBadge team={t} size="sm" />
            </Link>
          ))}
        </nav>
      )}

      <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-2">
        {prev >= s.start ? (
          <Link href={link(prev)} className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-line-2" aria-label={`Previous day, ${formatDay(prev)}`}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="size-11" />
        )}
        <form className="flex flex-col items-center" action="/entry">
          {user.isAdmin && <input type="hidden" name="team" value={team.id} />}
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
        {perm.editable ? (
          perm.unlockedByAdmin ? (
            <Chip tone="info"><Unlock className="size-3" aria-hidden="true" /> Unlocked by admin</Chip>
          ) : user.isAdmin ? (
            <Chip tone="info">Admin edit</Chip>
          ) : (
            minutesLeft !== null && <Chip tone={minutesLeft < 180 ? "warn" : "neutral"}><Deadline minutes={minutesLeft} /></Chip>
          )
        ) : (
          <Chip><Lock className="size-3" aria-hidden="true" /> Locked</Chip>
        )}
        {lastEdit && <span className="text-xs text-muted">Last saved by {nameOf(lastEdit.updatedBy)}</span>}
      </div>

      {perm.editable ? (
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
      ) : (
        <div className="space-y-3">
          <Notice tone="warn">{perm.reason}</Notice>
          <ul className="divide-y divide-line-2 rounded-2xl border border-line bg-surface">
            {rows.map((r) => (
              <li key={r.userId} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-semibold">{r.name}</span>
                <span className="tnum text-muted">{r.leave ? "On leave" : r.steps === null ? "Not entered" : fmt(r.steps)}</span>
              </li>
            ))}
          </ul>
          {perm.canRequest && (pending ? <Notice>A correction request for this date is waiting for an admin.</Notice> : <CorrectionRequest teamId={team.id} date={date} />)}
        </div>
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
