import { rebuildSchedule, saveChallenge, savePairing } from "@/app/actions/admin";
import { ConfirmSubmit, SubmitButton } from "@/components/client";
import { inputCls } from "@/components/fields";
import { Flash } from "@/components/flash";
import { TeamBadge } from "@/components/team";
import { Card, Chip, Notice, SectionTitle } from "@/components/ui";
import { formatRange } from "@/lib/engine/dates";
import { CHALLENGE_TYPES } from "@/lib/engine/engine";
import { getPortal } from "@/lib/server/season";

export default async function ScheduleAdmin({ searchParams }: PageProps<"/admin/schedule">) {
  const { season: s } = await getPortal();
  const teams = new Map(s.teams.map((t) => [t.id, t]));
  const first = s.teams[0];
  const canPair = s.teams.length === 4;

  return (
    <>
      <Flash searchParams={searchParams} />
      <Card className="mb-8 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="max-w-xl">
          <p className="font-semibold">Automatic rotating schedule</p>
          <p className="text-sm text-muted">
            Every team meets every other team once every {Math.max(1, s.teams.length - 1)} weeks. Regenerate after adding or removing teams. Results always recalculate from the pairings shown here.
          </p>
        </div>
        <form action={rebuildSchedule}>
          <ConfirmSubmit message="Regenerate the whole schedule? Past results will be recalculated using the new pairings.">Regenerate schedule</ConfirmSubmit>
        </form>
      </Card>

      {s.teams.length >= 2 && s.fixtures.length === 0 && (
        <div className="mb-6">
          <Notice tone="warn">
            No fixtures yet. Click <strong>Regenerate schedule</strong> above to create them for {s.teams.length} teams. Do this after adding or renaming teams.
          </Notice>
        </div>
      )}

      <SectionTitle title="Weeks" sub="Change a week's pairing or its optional challenge." />
      <ul className="space-y-3">
        {s.weeks.map((w) => {
          const fx = s.fixtures.filter((f) => f.week.index === w.index);
          const firstOpp = fx.find((f) => f.home.teamId === first?.id || f.away.teamId === first?.id);
          const oppId = firstOpp ? (firstOpp.home.teamId === first.id ? firstOpp.away.teamId : firstOpp.home.teamId) : "";
          const challenge = s.challenges.find((c) => c.weekIndex === w.index);
          return (
            <li key={w.index}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="w-40">
                    <p className="font-display text-lg font-bold uppercase">Week {w.number}</p>
                    <p className="text-xs text-muted">{formatRange(w.start, w.end)}</p>
                  </div>
                  <Chip tone={w.status === "live" ? "live" : w.status === "completed" ? "good" : "neutral"}>{w.status === "live" ? "Live" : w.status === "completed" ? "Played" : "Upcoming"}</Chip>
                  {w.finalSprint && <Chip tone="warn">Final Sprint</Chip>}
                  <ul className="flex flex-1 flex-wrap gap-x-5 gap-y-1">
                    {fx.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-sm">
                        <TeamBadge team={teams.get(f.home.teamId)!} size="sm" />
                        <span className="text-xs text-muted">v</span>
                        <TeamBadge team={teams.get(f.away.teamId)!} size="sm" />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-3 grid gap-3 border-t border-line-2 pt-3 sm:grid-cols-2">
                  {canPair && (
                    <form action={savePairing} className="flex items-end gap-2">
                      <input type="hidden" name="weekIndex" value={w.index} />
                      <label className="flex-1 text-xs font-semibold text-muted" htmlFor={`opp-${w.index}`}>
                        {first.name} play
                        <select id={`opp-${w.index}`} name="opponentId" defaultValue={oppId} className={`${inputCls} mt-1 font-normal text-ink`}>
                          {s.teams.slice(1).map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </label>
                      <SubmitButton variant="secondary">Set</SubmitButton>
                    </form>
                  )}
                  <form action={saveChallenge} className="flex items-end gap-2">
                    <input type="hidden" name="weekIndex" value={w.index} />
                    <label className="flex-1 text-xs font-semibold text-muted" htmlFor={`ch-${w.index}`}>
                      Weekly challenge
                      <select id={`ch-${w.index}`} name="type" defaultValue={challenge?.type ?? ""} className={`${inputCls} mt-1 font-normal text-ink`}>
                        <option value="">No challenge</option>
                        {Object.entries(CHALLENGE_TYPES).map(([k, c]) => (
                          <option key={k} value={k}>{c.title}</option>
                        ))}
                      </select>
                    </label>
                    <SubmitButton variant="secondary">Set</SubmitButton>
                  </form>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
