import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { userForSession, type SessionUser } from "./data.ts";

export const SESSION_COOKIE = "walkathon_session";

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? userForSession(token) : null;
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
