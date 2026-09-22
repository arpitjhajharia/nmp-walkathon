"use server";

import { redirect } from "next/navigation";
import { DEMO_PASSWORD } from "@/lib/engine/demo";
import { isDemoMode } from "@/lib/supabase/env";
import { userDb } from "@/lib/supabase/server";

async function finishSignIn(): Promise<string | null> {
  const db = await userDb();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  const { data: profile } = uid ? await db.from("profiles").select("active").eq("id", uid).maybeSingle() : { data: null };
  if (!profile?.active) {
    await db.auth.signOut();
    return "Your account isn't set up for the walkathon yet. Ask your admin to add you.";
  }
  return null;
}

export async function signIn(_prev: { error: string } | null, formData: FormData): Promise<{ error: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const domain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (domain && !email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
    return { error: `Please use your @${domain} work email.` };
  }
  const db = await userDb();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password don't match. Ask your walkathon admin if you need a new password." };
  const problem = await finishSignIn();
  if (problem) return { error: problem };
  redirect("/");
}

export async function demoSignIn(formData: FormData): Promise<void> {
  if (!isDemoMode()) redirect("/login");
  const db = await userDb();
  const { error } = await db.auth.signInWithPassword({ email: String(formData.get("email") ?? ""), password: DEMO_PASSWORD });
  if (error || (await finishSignIn())) redirect("/login");
  redirect("/");
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
