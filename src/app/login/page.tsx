import { Footprints } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { demoSignIn } from "@/app/actions/auth";
import { TeamIcon } from "@/components/team";
import { DEMO_PASSWORD } from "@/lib/engine/demo";
import { currentUser } from "@/lib/server/auth";
import { activeSeason, loadTeams, loadUsers, settingsOf } from "@/lib/server/repo";
import { createAdminClient, hasServiceKey } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  // Signed-out visitors can't read the database, so the welcome panel uses the server key
  // for just the season name and team names (and demo accounts in demo mode).
  // If the key is missing or wrong, still show the sign-in form (just without the extras).
  let seasonRow: Awaited<ReturnType<typeof activeSeason>> = null;
  let teams: Awaited<ReturnType<typeof loadTeams>> = [];
  let users: Awaited<ReturnType<typeof loadUsers>> = [];
  try {
    const service = hasServiceKey() ? createAdminClient() : null;
    seasonRow = service ? await activeSeason(service) : null;
    if (service && seasonRow) {
      teams = await loadTeams(service, seasonRow.id);
      if (isDemoMode()) users = await loadUsers(service, seasonRow.id);
    }
  } catch (err) {
    console.error("[login] couldn't load season details. Check SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY.", err);
  }
  const settings = seasonRow ? settingsOf(seasonRow) : null;
  const demo = isDemoMode() && users.length > 0;
  const admin = users.find((u) => u.isAdmin);
  const leads = teams.map((t) => ({ team: t, user: users.find((u) => u.id === t.leadUserId) })).filter((x) => x.user);
  const participant = users.find((u) => u.teamId && !teams.some((t) => t.leadUserId === u.id));

  return (
    <main className="flex min-h-dvh flex-col bg-night lg:flex-row">
      <section className="flex flex-1 flex-col justify-between px-6 py-8 text-white lg:px-12 lg:py-12">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-accent text-night">
            <Footprints className="size-5" strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span className="font-display text-2xl font-bold uppercase tracking-wide">Walkathon</span>
        </div>
        <div className="my-10 max-w-lg">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-accent">{settings ? `${settings.lengthDays}-day season` : "Office walking league"}</p>
          <h1 className="mt-2 font-display text-5xl font-bold uppercase leading-[0.95] sm:text-6xl">{settings?.seasonName ?? "Walkathon"}</h1>
          <p className="mt-4 text-lg text-white/75">Four teams, weekly fixtures, one league table. Every day at 5,000 steps or more earns your team a point.</p>
        </div>
        <ul className="flex flex-wrap gap-3" aria-label="Teams">
          {teams.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-sm font-semibold">
              <TeamIcon team={t} size="sm" />
              {t.name}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-1 items-center justify-center bg-canvas px-4 py-10 lg:rounded-l-[2rem]">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-bold uppercase text-ink">Sign in</h2>
          <p className="mb-6 text-sm text-muted">For office participants only. Your admin sets up your account.</p>
          <LoginForm />
          {demo && (
            <div className="mt-8 rounded-2xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-ink">Demo mode: try a role</p>
              <p className="mb-3 text-xs text-muted">
                Every demo account uses the password <code className="rounded bg-line-2 px-1">{DEMO_PASSWORD}</code>.
              </p>
              <div className="grid gap-2">
                {[
                  participant && { label: "Participant", sub: participant.name, email: participant.email },
                  leads[0] && { label: `Team lead · ${leads[0].team.name}`, sub: leads[0].user!.name, email: leads[0].user!.email },
                  admin && { label: "Admin", sub: admin.name, email: admin.email },
                ]
                  .filter((x): x is { label: string; sub: string; email: string } => Boolean(x))
                  .map((r) => (
                    <form key={r.email} action={demoSignIn}>
                      <input type="hidden" name="email" value={r.email} />
                      <button type="submit" className="flex min-h-12 w-full items-center justify-between rounded-xl bg-line-2 px-3 text-left hover:bg-line">
                        <span>
                          <span className="block text-sm font-semibold text-ink">{r.label}</span>
                          <span className="block text-xs text-muted">{r.sub}</span>
                        </span>
                        <span aria-hidden="true" className="text-muted">→</span>
                      </button>
                    </form>
                  ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
