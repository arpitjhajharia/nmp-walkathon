import { Footprints } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { demoSignIn } from "@/app/actions/auth";
import { TeamIcon } from "@/components/team";
import { DEMO_PASSWORD } from "@/lib/engine/demo";
import { currentAdmin } from "@/lib/server/auth";
import { activeSeason, loadTeams, settingsOf } from "@/lib/server/repo";
import { userDb } from "@/lib/supabase/server";
import { createAdminClient, hasServiceKey } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin sign-in" };

export default async function LoginPage() {
  if (await currentAdmin()) redirect("/admin");
  // Visitors can read the season, so the welcome panel uses the normal public client. The
  // demo admin's email comes from the server key (emails aren't public).
  let seasonRow: Awaited<ReturnType<typeof activeSeason>> = null;
  let teams: Awaited<ReturnType<typeof loadTeams>> = [];
  let demoAdmin: { name: string; email: string } | null = null;
  try {
    const db = await userDb();
    seasonRow = await activeSeason(db);
    if (seasonRow) teams = await loadTeams(db, seasonRow.id);
    if (isDemoMode() && hasServiceKey()) {
      const { data } = await createAdminClient().from("profiles").select("name, email").eq("is_admin", true).not("auth_user_id", "is", null).order("name").limit(1).maybeSingle();
      demoAdmin = data;
    }
  } catch (err) {
    console.error("[login] couldn't load season details", err);
  }
  const settings = seasonRow ? settingsOf(seasonRow) : null;

  return (
    <main className="flex min-h-dvh flex-col bg-night lg:flex-row">
      <section className="flex flex-1 flex-col justify-between px-6 py-8 text-white lg:px-12 lg:py-12">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-accent text-night">
            <Footprints className="size-5" strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span className="font-display text-2xl font-bold uppercase tracking-wide">Walkathon</span>
        </Link>
        <div className="my-10 max-w-lg">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-accent">{settings ? `${settings.lengthDays}-day season` : "Office walking league"}</p>
          <h1 className="mt-2 font-display text-5xl font-bold uppercase leading-[0.95] sm:text-6xl">{settings?.seasonName ?? "Walkathon"}</h1>
          <p className="mt-4 text-lg text-white/75">Anyone can follow the league. Only admins sign in, to enter steps and run the season.</p>
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
          <h2 className="font-display text-3xl font-bold uppercase text-ink">Admin sign-in</h2>
          <p className="mb-6 text-sm text-muted">
            Just here to see the scores? <Link href="/" className="font-semibold text-night-3 underline">View the walkathon</Link>, no sign-in needed.
          </p>
          <LoginForm />
          {demoAdmin && (
            <div className="mt-8 rounded-2xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-ink">Demo mode</p>
              <p className="mb-3 text-xs text-muted">
                The demo admin&apos;s password is <code className="rounded bg-line-2 px-1">{DEMO_PASSWORD}</code>.
              </p>
              <form action={demoSignIn}>
                <input type="hidden" name="email" value={demoAdmin.email} />
                <button type="submit" className="flex min-h-12 w-full items-center justify-between rounded-xl bg-line-2 px-3 text-left hover:bg-line">
                  <span>
                    <span className="block text-sm font-semibold text-ink">Sign in as the demo admin</span>
                    <span className="block text-xs text-muted">{demoAdmin.name}</span>
                  </span>
                  <span aria-hidden="true" className="text-muted">→</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
