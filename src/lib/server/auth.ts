import { redirect } from "next/navigation";
import { cache } from "react";
import { userDb } from "../supabase/server";

/** The signed-in admin. Visitors never sign in, so everyone else is null. */
export interface AdminUser {
  id: string;
  name: string;
  authUserId: string;
}

export const currentAdmin = cache(async (): Promise<AdminUser | null> => {
  const db = await userDb();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;
  const { data: profileId } = await db.rpc("current_profile_id");
  if (!profileId) return null;
  const { data: profile } = await db.from("profiles").select("id, name, is_admin, active").eq("id", profileId).maybeSingle();
  if (!profile?.active || !profile.is_admin) return null;
  return { id: profile.id, name: profile.name, authUserId: uid };
});

export async function requireAdmin(): Promise<AdminUser> {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return admin;
}
