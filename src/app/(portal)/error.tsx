"use client";

import { RotateCcw } from "lucide-react";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
      <p className="font-display text-3xl font-bold uppercase">Rain delay</p>
      <p className="mt-2 text-sm text-muted">Something went wrong loading this page. Your saved entries are safe.</p>
      {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-night px-4 text-sm font-semibold text-white hover:bg-night-2">
        <RotateCcw className="size-4" aria-hidden="true" /> Try again
      </button>
    </div>
  );
}
