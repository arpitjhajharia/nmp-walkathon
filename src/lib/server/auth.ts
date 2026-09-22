import { redirect } from "next/navigation";
import { cache } from "react";
import { userDb } from "../supabase/server";
import { activeSeason } from "./repo.ts";
import type { SessionUser } from "./data";

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const db = await userDb();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;
  // Row-level security only returns profiles to active members, so an inactive or
  // unknown account comes back empty and is treated as signed out.
  const { data: profile } = await db.from("profiles").select("id, name, email, is_admin, active").eq("id", uid).maybeSingle();
  if (!profile?.active) return null;
  const season = await activeSeason(db);
  let teamId: string | null = null;
  let leadTeamId: string | null = null;
  if (season) {
    const [{ data: member }, { data: lead }] = await Promise.all([
      db.from("team_members").select("team_id").eq("season_id", season.id).eq("user_id", uid).maybeSingle(),
      db.from("teams").select("id").eq("season_id", season.id).eq("lead_user_id", uid).maybeSingle(),
    ]);
    teamId = member?.team_id ?? null;
    leadTeamId = lead?.id ?? null;
  }
  return { id: profile.id, name: profile.name, email: profile.email, isAdmin: profile.is_admin, active: profile.active, teamId, leadTeamId };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}

export function canEnterSteps(user: SessionUser): boolean {
  return user.isAdmin || user.leadTeamId !== null;
}
