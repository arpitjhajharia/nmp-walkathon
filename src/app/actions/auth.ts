"use server";

import { redirect } from "next/navigation";
import { DEMO_PASSWORD } from "@/lib/engine/demo";
import { isDemoMode } from "@/lib/supabase/env";
import { userDb } from "@/lib/supabase/server";

/** Only admins sign in. Anyone else is signed straight back out. */
async function finishSignIn(): Promise<string | null> {
  const db = await userDb();
  const { data: profileId } = await db.rpc("current_profile_id");
  const { data: profile } = profileId ? await db.from("profiles").select("is_admin, active").eq("id", profileId).maybeSingle() : { data: null };
  if (!profile?.active || !profile.is_admin) {
    await db.auth.signOut();
    return "Only walkathon admins sign in. Everyone else can view the site without an account.";
  }
  return null;
}

export async function signIn(_prev: { error: string } | null, formData: FormData): Promise<{ error: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Admins are the only people who sign in, so this limits admin accounts to your domain.
  // Accepts "company.com", "@company.com" or a list like "a.com, b.com".
  const domains = (process.env.ALLOWED_EMAIL_DOMAIN ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  if (domains.length && !domains.some((d) => email.toLowerCase().endsWith(`@${d}`))) {
    return { error: `Please use your ${domains.map((d) => `@${d}`).join(" or ")} work email.` };
  }
  const db = await userDb();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password don't match. Another admin can reset your password." };
  const problem = await finishSignIn();
  if (problem) return { error: problem };
  redirect("/admin");
}

export async function demoSignIn(formData: FormData): Promise<void> {
  if (!isDemoMode()) redirect("/login");
  const db = await userDb();
  const { error } = await db.auth.signInWithPassword({ email: String(formData.get("email") ?? ""), password: DEMO_PASSWORD });
  if (error || (await finishSignIn())) redirect("/login");
  redirect("/admin");
}

/** Clears the session. The caller then does a full page load of /login, so nothing from the old session is reused. */
export async function signOut(): Promise<void> {
  const db = await userDb();
  await db.auth.signOut();
}

export async function changePassword(_prev: { ok: boolean; message: string } | null, formData: FormData): Promise<{ ok: boolean; message: string }> {
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < 8) return { ok: false, message: "Use at least 8 characters." };
  if (next !== confirm) return { ok: false, message: "The two passwords don't match." };
  const db = await userDb();
  const { error } = await db.auth.updateUser({ password: next });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Password changed." };
}
