"use client";

import { AlertTriangle, CheckCircle2, ClipboardCopy, RotateCcw } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { saveEntries, type SaveState } from "@/app/actions/entry";
import { SubmitButton } from "@/components/client";
import { Pips } from "@/components/ui";
import type { Band } from "@/lib/engine/types";

export interface EntryRow {
  userId: string;
  name: string;
  isLead: boolean;
  steps: number | null;
  leave: boolean;
  yesterday: number | null;
  yesterdayLeave: boolean;
}

function points(steps: number, bands: Band[]) {
  let p = 0;
  for (const b of [...bands].sort((a, c) => a.min - c.min)) if (steps >= b.min) p = b.points;
  return p;
}

function nextGap(steps: number, bands: Band[]) {
  const cur = points(steps, bands);
  const next = [...bands].sort((a, c) => a.min - c.min).find((b) => b.min > steps && b.points > cur);
  return next ? next.min - steps : null;
}

const parse = (v: string) => {
  const raw = v.replace(/[,\s]/g, "");
  if (raw === "") return { empty: true, valid: true, n: 0 };
  if (!/^\d+$/.test(raw)) return { empty: false, valid: false, n: 0 };
  return { empty: false, valid: true, n: Number(raw) };
};

export function EntryForm({
  teamId,
  date,
  rows,
  bands,
  maxDaily,
  highValue,
  teamColor,
  hasYesterday,
}: {
  teamId: string;
  date: string;
  rows: EntryRow[];
  bands: Band[];
  maxDaily: number;
  highValue: number;
  teamColor: string;
  hasYesterday: boolean;
}) {
  const initial = useMemo(() => Object.fromEntries(rows.map((r) => [r.userId, { value: r.steps === null ? "" : String(r.steps), leave: r.leave }])), [rows]);
  const [values, setValues] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [highOk, setHighOk] = useState(false);
  const [state, action] = useActionState<SaveState | null, FormData>(saveEntries, null);

  useEffect(() => {
    setValues(initial);
    setCopied(false);
    setReviewed(false);
    setHighOk(false);
  }, [initial]);

  useEffect(() => {
    if (state?.ok) {
      setCopied(false);
      setReviewed(false);
      setHighOk(false);
    }
  }, [state]);

  let earned = 0,
    possible = 0,
    filled = 0;
  const high: string[] = [];
  let invalid = false;
  for (const r of rows) {
    const v = values[r.userId];
    if (v.leave) {
      filled++;
      continue;
    }
    possible += maxDaily;
    const p = parse(v.value);
    if (!p.valid) invalid = true;
    if (!p.empty && p.valid) {
      filled++;
      earned += points(p.n, bands);
      if (p.n > highValue) high.push(r.name.split(" ")[0]);
    }
  }
  const dirty = rows.some((r) => values[r.userId].value !== initial[r.userId].value || values[r.userId].leave !== initial[r.userId].leave);
  const blockedByCopy = copied && !reviewed;
  const blockedByHigh = high.length > 0 && !highOk;

  const copyYesterday = () => {
    setValues((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (r.yesterdayLeave) continue;
        if (r.yesterday !== null) next[r.userId] = { value: String(r.yesterday), leave: false };
      }
      return next;
    });
    setCopied(true);
    setReviewed(false);
  };

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="date" value={date} />

      <div className="sticky top-14 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Team points today</p>
          <p className="tnum font-display text-3xl font-bold leading-none" aria-live="polite">
            {earned}
            <span className="text-xl text-muted"> / {possible}</span>
          </p>
        </div>
        <p className="tnum text-right text-sm text-muted">
          {filled} of {rows.length}
          <br />
          entered
        </p>
      </div>

      {hasYesterday && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copyYesterday} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line hover:bg-line-2">
            <ClipboardCopy className="size-4" aria-hidden="true" /> Copy yesterday&apos;s values
          </button>
          {dirty && (
            <button
              type="button"
              onClick={() => {
                setValues(initial);
                setCopied(false);
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-line-2"
            >
              <RotateCcw className="size-4" aria-hidden="true" /> Undo changes
            </button>
          )}
        </div>
      )}

      <ul className="space-y-2.5">
        {rows.map((r) => {
          const v = values[r.userId];
          const p = parse(v.value);
          const pts = !v.leave && !p.empty && p.valid ? points(p.n, bands) : 0;
          const gap = !v.leave && !p.empty && p.valid ? nextGap(p.n, bands) : null;
          const err = state?.errors?.[r.userId] ?? (!p.valid ? "Use a whole number of steps, 0 or more." : null);
          const isHigh = p.valid && !p.empty && p.n > highValue;
          const id = `steps_${r.userId}`;
          return (
            <li key={r.userId} className="rounded-2xl border border-line bg-surface p-3.5 sm:p-4">
              <div className="flex items-center gap-3">
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: teamColor }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <label htmlFor={id} className="block truncate font-semibold text-ink">
                    {r.name}
                    {r.isLead && <span className="ml-1.5 text-xs font-normal text-muted">(lead)</span>}
                  </label>
                  <p className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
                    {v.leave ? (
                      "On leave: not counted"
                    ) : p.empty ? (
                      "Not entered"
                    ) : p.valid ? (
                      <>
                        <Pips points={pts} max={maxDaily} />
                        <span>
                          {pts} pt{pts === 1 ? "" : "s"}
                          {gap !== null && gap <= 2000 ? ` · ${gap.toLocaleString("en-US")} to next band` : ""}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <input
                  id={id}
                  name={id}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint="next"
                  placeholder={v.leave ? "Leave" : "Steps"}
                  disabled={v.leave}
                  value={v.leave ? "" : v.value}
                  onChange={(e) => setValues((prev) => ({ ...prev, [r.userId]: { ...prev[r.userId], value: e.target.value } }))}
                  aria-invalid={Boolean(err)}
                  aria-describedby={err ? `${id}-err` : isHigh ? `${id}-warn` : undefined}
                  className={`tnum h-12 w-32 rounded-xl border bg-surface px-3 text-right font-display text-2xl font-bold disabled:bg-line-2 disabled:text-muted sm:w-40 ${
                    err ? "border-loss ring-2 ring-loss/20" : isHigh ? "border-amber-400" : "border-line focus:border-night-3"
                  }`}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 pl-4">
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    name={`leave_${r.userId}`}
                    checked={v.leave}
                    onChange={(e) => setValues((prev) => ({ ...prev, [r.userId]: { ...prev[r.userId], leave: e.target.checked } }))}
                    className="size-4.5 accent-night"
                  />
                  On leave
                </label>
                {r.yesterday !== null && !v.leave && <span className="tnum text-xs text-muted">Yesterday {r.yesterday.toLocaleString("en-US")}</span>}
              </div>
              {err && (
                <p id={`${id}-err`} className="mt-1 pl-4 text-sm font-medium text-loss">
                  {err}
                </p>
              )}
              {isHigh && !err && (
                <p id={`${id}-warn`} className="mt-1 flex items-center gap-1.5 pl-4 text-sm text-amber-800">
                  <AlertTriangle className="size-4" aria-hidden="true" /> That&apos;s over {highValue.toLocaleString("en-US")}. Double-check it before saving.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {copied && (
        <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-0.5 size-4.5 accent-night" />
          <span>
            <strong>Yesterday&apos;s values were copied in.</strong> I&apos;ve checked each number against today&apos;s actual steps.
          </span>
        </label>
      )}
      {high.length > 0 && (
        <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <input type="checkbox" checked={highOk} onChange={(e) => setHighOk(e.target.checked)} className="mt-0.5 size-4.5 accent-night" />
          <span>
            Yes, the high value{high.length > 1 ? "s" : ""} for {high.join(", ")} {high.length > 1 ? "are" : "is"} correct.
          </span>
        </label>
      )}

      {state && (
        <div role={state.ok ? "status" : "alert"} className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${state.ok ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-1 ring-rose-200"}`}>
          {state.ok ? <CheckCircle2 className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />}
          <span>
            {state.message}
            {state.savedAt && <span className="font-normal"> ({state.savedAt})</span>}
          </span>
        </div>
      )}

      <div className="pt-1">
        <SubmitButton className="w-full text-base" disabled={invalid || blockedByCopy || blockedByHigh}>
          Save all {rows.length} entries
        </SubmitButton>
        <p className="mt-1.5 text-center text-xs text-muted">
          {blockedByCopy ? "Confirm you've reviewed the copied values to save." : blockedByHigh ? "Confirm the high values to save." : "Blank fields are saved as not entered and earn no points."}
        </p>
      </div>
    </form>
  );
}
