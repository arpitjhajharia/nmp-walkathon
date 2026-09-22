import { saveSeason } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client";
import { Field, inputCls } from "@/components/fields";
import { Flash } from "@/components/flash";
import { Card, Notice, SectionTitle } from "@/components/ui";
import { addDays, formatDay } from "@/lib/engine/dates";
import { sortedBands } from "@/lib/engine/engine";
import { getSettings } from "@/lib/server/data";

export default async function SeasonSettings({ searchParams }: PageProps<"/admin/season">) {
  const s = await getSettings();
  const bands = sortedBands(s.bands);
  const end = addDays(s.startDate, s.lengthDays - 1);
  return (
    <>
      <Flash searchParams={searchParams} />
      <Notice tone="warn">
        Changes apply to the whole season and everything recalculates immediately. To keep things fair, avoid changing scoring rules once the season is under way.
      </Notice>
      <form action={saveSeason} className="mt-6 space-y-8">
        <section>
          <SectionTitle title="Competition" sub={`Currently ${formatDay(s.startDate)} to ${formatDay(end)}`} />
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Competition name" htmlFor="seasonName" className="sm:col-span-2">
              <input id="seasonName" name="seasonName" defaultValue={s.seasonName} required className={inputCls} />
            </Field>
            <Field label="Start date" htmlFor="startDate" hint="Changing dates rebuilds the fixture schedule.">
              <input id="startDate" name="startDate" type="date" defaultValue={s.startDate} required className={inputCls} />
            </Field>
            <Field label="Length (days)" htmlFor="lengthDays">
              <input id="lengthDays" name="lengthDays" type="number" min={7} max={366} defaultValue={s.lengthDays} required className={inputCls} />
            </Field>
            <Field label="Timezone" htmlFor="timezone" hint="All dates and deadlines use this timezone, e.g. Asia/Kolkata.">
              <input id="timezone" name="timezone" defaultValue={s.timezone} required className={inputCls} />
            </Field>
            <Field label="Final Sprint length (days)" htmlFor="finalSprintDays">
              <input id="finalSprintDays" name="finalSprintDays" type="number" min={1} defaultValue={s.finalSprintDays} required className={inputCls} />
            </Field>
            <Field label="Team size" htmlFor="teamSize" hint="Used for display and planning.">
              <input id="teamSize" name="teamSize" type="number" min={1} defaultValue={s.teamSize} required className={inputCls} />
            </Field>
          </Card>
        </section>

        <section>
          <SectionTitle title="Step bands" sub="Daily steps needed for each team point level." />
          <Card className="p-5">
            <div className="grid grid-cols-[1fr_1fr] gap-x-4 gap-y-2 sm:max-w-md">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">From (steps)</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Team points</p>
              {bands.map((b, i) => (
                <div key={i} className="contents">
                  <label className="sr-only" htmlFor={`band_min_${i}`}>Band {i + 1} minimum steps</label>
                  <input id={`band_min_${i}`} name={`band_min_${i}`} type="number" min={0} defaultValue={b.min} readOnly={i === 0} className={`${inputCls} ${i === 0 ? "bg-line-2" : ""}`} />
                  <label className="sr-only" htmlFor={`band_points_${i}`}>Band {i + 1} points</label>
                  <input id={`band_points_${i}`} name={`band_points_${i}`} type="number" min={0} defaultValue={b.points} className={inputCls} />
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle title="League points" />
          <Card className="grid grid-cols-3 gap-4 p-5 sm:max-w-md">
            {(["win", "draw", "loss"] as const).map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)} htmlFor={k}>
                <input id={k} name={k} type="number" min={0} defaultValue={s.leaguePoints[k]} required className={inputCls} />
              </Field>
            ))}
          </Card>
        </section>

        <section>
          <SectionTitle title="Entry" />
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Results provisional for (days)" htmlFor="correctionDays" hint="After a week ends, its result is marked provisional for this many days while corrections come in.">
              <input id="correctionDays" name="correctionDays" type="number" min={0} max={14} defaultValue={s.correctionDays} required className={inputCls} />
            </Field>
            <Field label="High-value warning (steps)" htmlFor="highValueWarning" hint="Values above this need a second confirmation when saving.">
              <input id="highValueWarning" name="highValueWarning" type="number" min={1000} defaultValue={s.highValueWarning} required className={inputCls} />
            </Field>
          </Card>
        </section>

        <SubmitButton className="w-full sm:w-auto">Save settings</SubmitButton>
      </form>
    </>
  );
}
