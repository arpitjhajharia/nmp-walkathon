export const inputCls = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] focus:border-night-3";

export function Field({ label, htmlFor, hint, children, className = "" }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
