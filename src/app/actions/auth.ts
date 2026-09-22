"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/server/db";
import { createSession, deleteSession, findUserByEmail } from "@/lib/server/data";
import { SESSION_COOKIE } from "@/lib/server/auth";
import { verifyPassword } from "@/lib/server/passwords";

async function startSession(userId: string) {
  const { token, expires } = createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function signIn(_prev: { error: string } | null, formData: FormData): Promise<{ error: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const domain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (domain && !email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
    return { error: `Please use your @${domain} work email.` };
  }
  const user = email ? findUserByEmail(email) : null;
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return { error: "That email and password don't match. Ask your walkathon admin if you need a new password." };
  }
  await startSession(user.id);
  redirect("/");
}

export async function demoSignIn(formData: FormData): Promise<void> {
  if (!isDemoMode()) redirect("/login");
  const user = findUserByEmail(String(formData.get("email") ?? ""));
  if (!user) redirect("/login");
  await startSession(user.id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
