"use client";

import { useActionState } from "react";
import { importCsv, type ImportState } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client";

export function ImportForm() {
  const [state, action] = useActionState<ImportState | null, FormData>(importCsv, null);
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="csv" className="block text-sm font-semibold">CSV file</label>
      <input id="csv" name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-line-2 file:px-3 file:font-semibold" />
      <p className="text-xs text-muted">
        Columns: <code>date</code> (YYYY-MM-DD), <code>email</code>, <code>steps</code>, and optional <code>on_leave</code> (yes/no). Every row is validated first; if any row has a problem, nothing is imported.
      </p>
      {state && (
        <div role={state.ok ? "status" : "alert"} className={`rounded-xl px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-950" : "bg-rose-50 text-rose-900"}`}>
          {state.message}
          {state.errors && (
            <ul className="mt-1 list-disc pl-5">
              {state.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <SubmitButton variant="secondary">Import entries</SubmitButton>
    </form>
  );
}
