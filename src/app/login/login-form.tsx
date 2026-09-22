"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client";

export function LoginForm() {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-semibold text-ink">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[16px] focus:border-night-3" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-semibold text-ink">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[16px] focus:border-night-3" />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {state.error}
        </p>
      )}
      <SubmitButton className="w-full">Sign in</SubmitButton>
    </form>
  );
}
