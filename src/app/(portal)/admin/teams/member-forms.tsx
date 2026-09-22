"use client";

import { useActionState } from "react";
import { changeAdminAccess, createMember, resetPassword, type MemberState } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client";
import { Field, inputCls } from "@/components/fields";

function Result({ state }: { state: MemberState | null }) {
  if (!state) return null;
  return (
    <div role={state.ok ? "status" : "alert"} className={`rounded-xl px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-950" : "bg-rose-50 text-rose-900"}`}>
      {state.message}
      {state.password && <code className="ml-2 select-all rounded bg-white px-2 py-0.5 font-mono font-bold">{state.password}</code>}
    </div>
  );
}

export function AddMemberForm({ teams }: { teams: { id: string; name: string }[] }) {
  const [state, action] = useActionState<MemberState | null, FormData>(createMember, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Full name" htmlFor="new-name">
        <input id="new-name" name="name" required className={inputCls} />
      </Field>
      <Field label="Work email" htmlFor="new-email">
        <input id="new-email" name="email" type="email" required className={inputCls} />
      </Field>
      <Field label="Team" htmlFor="new-team">
        <select id="new-team" name="teamId" className={inputCls} defaultValue={teams[0]?.id}>
          <option value="">No team (admin only)</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 self-end pb-3 text-sm">
        <input type="checkbox" name="isAdmin" className="size-4.5 accent-night" /> Admin (can sign in and change things)
      </label>
      <div className="space-y-2 sm:col-span-2">
        <Result state={state} />
        <SubmitButton>Add member</SubmitButton>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ userId, name }: { userId: string; name: string }) {
  const [state, action] = useActionState<MemberState | null, FormData>(resetPassword, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton variant="secondary">Reset password for {name.split(" ")[0]}</SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function AdminAccessForm({ userId, grant }: { userId: string; grant: boolean }) {
  const [state, action] = useActionState<MemberState | null, FormData>(changeAdminAccess, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="grant" value={grant ? "yes" : "no"} />
      <SubmitButton variant="secondary">{grant ? "Make admin" : "Remove admin access"}</SubmitButton>
      <Result state={state} />
    </form>
  );
}
