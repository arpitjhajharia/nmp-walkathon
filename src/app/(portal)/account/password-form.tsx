"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client";
import { Field, inputCls } from "@/components/fields";

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputCls} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className={inputCls} />
      </Field>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
          {state.message}
        </p>
      )}
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}
