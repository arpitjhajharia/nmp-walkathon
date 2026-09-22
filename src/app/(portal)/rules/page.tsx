import { Heart } from "lucide-react";
import type { Metadata } from "next";
import { Card, PageHeader, Pips } from "@/components/ui";
import { formatShort } from "@/lib/engine/dates";
import { BADGES, CHALLENGE_TYPES, bandLabel, sortedBands } from "@/lib/engine/engine";
import { requireUser } from "@/lib/server/auth";
import { getPortal } from "@/lib/server/season";

export const metadata: Metadata = { title: "Rules" };

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-20">
      <h2 id={id} className="mb-2 font-display text-2xl font-bold uppercase">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

export default async function RulesPage() {
  await requireUser();
  const { season: s } = getPortal();
  const cfg = s.settings;
  const bands = sortedBands(cfg.bands);
  const max = s.maxDaily;
  const deadline = cfg.correctionDays === 1 ? "until 11:59 PM the next day" : `for ${cfg.correctionDays} days afterwards, until 11:59 PM`;

  return (
    <>
      <PageHeader eyebrow="Rules & help" title="How it works">
        {cfg.seasonName} runs from {formatShort(s.start)} to {formatShort(s.end)} ({cfg.lengthDays} days). All dates and deadlines use {cfg.timezone.replace("_", " ")} time.
      </PageHeader>

      <div className="mb-8 flex items-start gap-3 rounded-2xl bg-emerald-50 px-5 py-4 ring-1 ring-emerald-200">
        <Heart className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
        <p className="text-[15px] text-emerald-950">
          <strong>Healthy habits come first.</strong> Walking regularly matters more than huge totals. Points stop at {bands[bands.length - 1].min.toLocaleString("en-US")} steps, so there is no reason to overdo it. Rest when you need to.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-10">
          <Block id="bands" title="Daily team points">
            <p>Each day, your steps earn points for your team:</p>
            <Card className="overflow-hidden">
              <table className="tnum w-full text-sm">
                <caption className="sr-only">Step bands and points</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    <th scope="col" className="px-4 py-2.5">Daily steps</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Team points</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => (
                    <tr key={b.min} className="border-b border-line-2 last:border-0">
                      <td className="px-4 py-2.5 font-semibold">{bandLabel(b, bands)}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center justify-end gap-3">
                          <Pips points={b.points} max={max} />
                          <span className="w-4 text-right font-display text-lg font-bold">{b.points}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <p>
              A team of {cfg.teamSize} can earn up to {max * cfg.teamSize} points a day. Scores show as earned out of possible points, for example &ldquo;14 / 16 points&rdquo;.
            </p>
          </Block>

          <Block id="fixtures" title="Weekly fixtures & the league">
            <p>Every week (Monday to Sunday), teams play one head-to-head fixture. Add up each team&apos;s daily points for the week: more points wins.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Win: <strong>{cfg.leaguePoints.win} league points</strong></li>
              <li>Draw: <strong>{cfg.leaguePoints.draw} league point{cfg.leaguePoints.draw === 1 ? "" : "s"} each</strong></li>
              <li>Loss: <strong>{cfg.leaguePoints.loss} league points</strong></li>
            </ul>
            <p>The table is ranked by league points, then fixtures won, then total team activity points, then total steps as a final tie-breaker.</p>
            <p>
              <strong>Monthly Cup:</strong> the team with the most daily team points in each calendar month. <strong>Final Sprint:</strong> the last {cfg.finalSprintDays} days ({formatShort(s.finalSprint.start)} to {formatShort(s.finalSprint.end)}), with a trophy for the most daily team points. The league leader at the end is <strong>Season Champion</strong>.
            </p>
          </Block>

          <Block id="leave" title="Leave">
            <p>If you&apos;re on leave, your team lead ticks &ldquo;On leave&rdquo; for that day. You&apos;re left out of your team&apos;s possible points and your streak is paused, not broken.</p>
            <p>A missing entry is different: it earns no points, and the portal never guesses or copies steps automatically.</p>
          </Block>

          <Block id="entry" title="Entering steps & corrections">
            <p>Team leads enter each member&apos;s daily steps. Entries for a date can be edited {deadline}. After that, the date locks; a lead can ask an admin to unlock it for a correction.</p>
            <p>Every change is recorded with who made it and when. Scores, results, standings and awards recalculate automatically after any change.</p>
          </Block>

          <Block id="awards" title="Awards, badges & challenges">
            <p>Individual recognition never changes team points. Every Sunday we award:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Weekly MVP:</strong> most steps that week.</li>
              <li><strong>Consistency Star:</strong> most days at 5,000+ that week.</li>
              <li><strong>Comeback Walker:</strong> biggest rise in average daily steps against your own previous week (at least 3 recorded days in each).</li>
              <li><strong>Team Player:</strong> the biggest point contributor in the team with the highest share of active member-days.</li>
            </ul>
            <p>Ties mean joint winners. <strong>Most improved</strong> compares your latest 7-day average with your first 7-day average; only days with an entry count.</p>
            <p>
              <strong>Badges:</strong> {BADGES.map((b) => b.name).join(", ")}. Streaks count consecutive days at 5,000+ steps.
            </p>
            <p>
              <strong>Weekly challenges</strong> are optional, like {Object.values(CHALLENGE_TYPES).map((c) => c.title).join(", ")}. They&apos;re tracked automatically and never affect league scoring.
            </p>
          </Block>
        </div>
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-20 space-y-1 text-sm">
            {[
              ["bands", "Daily team points"],
              ["fixtures", "Fixtures & league"],
              ["leave", "Leave"],
              ["entry", "Entry & corrections"],
              ["awards", "Awards & badges"],
            ].map(([id, l]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-muted hover:bg-line-2 hover:text-ink">{l}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}
