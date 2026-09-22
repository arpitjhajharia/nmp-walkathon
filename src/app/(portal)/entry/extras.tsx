"use client";

import { Clock } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { submitCorrectionRequest, type SaveState } from "@/app/actions/entry";
import { SubmitButton } from "@/components/client";

export function Deadline({ minutes }: { minutes: number }) {
  const [left, setLeft] = useState(minutes);
  useEffect(() => {
    setLeft(minutes);
    const t = setInterval(() => setLeft((m) => Math.max(0, m - 1)), 60_000);
    return () => clearInterval(t);
  }, [minutes]);
  const h = Math.floor(left / 60);
  const m = left % 60;
  return (
    <span className="tnum inline-flex items-center gap-1.5">
      <Clock className="size-3.5" aria-hidden="true" />
      Editable for {h > 0 ? `${h}h ` : ""}
      {m}m more
    </span>
  );
}

export function CorrectionRequest({ teamId, date }: { teamId: string; date: string }) {
  const [state, action] = useActionState<SaveState | null, FormData>(submitCorrectionRequest, null);
  if (state?.ok) return <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">{state.message}</p>;
  return (
    <form action={action} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="date" value={date} />
      <label htmlFor="reason" className="block text-sm font-semibold">Ask an admin to unlock this date</label>
      <textarea id="reason" name="reason" rows={2} required placeholder="e.g. Rohan's steps were typed as 1,200 instead of 12,000" className="w-full rounded-xl border border-line px-3 py-2 text-[16px]" />
      {state && !state.ok && <p role="alert" className="text-sm text-loss">{state.message}</p>}
      <SubmitButton variant="secondary">Send request</SubmitButton>
    </form>
  );
}
