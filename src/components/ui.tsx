import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import Link from "next/link";
import type { FormResult } from "@/lib/engine/engine";

export function Card({ children, className = "", as: Tag = "section" }: { children: React.ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  const bg = /(^|\s)bg-/.test(className) ? "" : "bg-surface";
  return <Tag className={`rounded-2xl border border-line ${bg} shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>{children}</Tag>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-5 sm:mb-7">
      {eyebrow && <p className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>}
      <h1 className="font-display text-[2rem] font-bold uppercase leading-none tracking-tight text-ink sm:text-[2.6rem]">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-[15px] text-muted">{children}</div>}
    </header>
  );
}

export function SectionTitle({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">{title}</h2>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {action && (
        <Link href={action.href} className="shrink-0 text-sm font-semibold text-night-3 hover:underline">
          {action.label} →
        </Link>
      )}
    </div>
  );
}

export function Chip({ children, tone = "neutral", className = "" }: { children: React.ReactNode; tone?: "neutral" | "live" | "good" | "warn" | "info" | "dark"; className?: string }) {
  const tones = {
    neutral: "bg-line-2 text-ink-2",
    live: "bg-rose-50 text-live ring-1 ring-rose-200",
    good: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
    warn: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
    info: "bg-sky-50 text-sky-900 ring-1 ring-sky-200",
    dark: "bg-night text-white",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}

export function LiveDot() {
  return <span className="live-dot inline-block size-2 rounded-full bg-live text-live" aria-hidden="true" />;
}

export function EmptyState({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "good" | "warn" | "bad"; children: React.ReactNode }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-950",
    good: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warn: "border-amber-200 bg-amber-50 text-amber-950",
    bad: "border-rose-200 bg-rose-50 text-rose-950",
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="tnum font-display text-3xl font-bold leading-tight text-ink">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Progress({ value, max, color = "#0d1b2e", label }: { value: number; max: number; color?: string; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line-2" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

/** Rank movement: positive = moved up. */
export function Movement({ value, unit = "" }: { value: number | null; unit?: string }) {
  if (value === null) return <span className="text-xs text-muted">–</span>;
  if (value === 0)
    return (
      <span className="inline-flex items-center text-xs text-muted" title="No change">
        <Minus className="size-3.5" aria-hidden="true" />
        <span className="sr-only">No change</span>
      </span>
    );
  const up = value > 0;
  return (
    <span className={`tnum inline-flex items-center gap-0.5 text-xs font-semibold ${up ? "text-win" : "text-loss"}`}>
      {up ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />}
      {Math.abs(value).toLocaleString("en-US")}
      {unit}
      <span className="sr-only">{up ? " up" : " down"}</span>
    </span>
  );
}

const FORM_STYLE: Record<FormResult, string> = {
  W: "bg-win text-white",
  D: "bg-draw text-white",
  L: "bg-loss/10 text-loss ring-1 ring-loss/30",
};
const FORM_WORD: Record<FormResult, string> = { W: "Won", D: "Drew", L: "Lost" };

export function FormGuide({ form }: { form: FormResult[] }) {
  if (form.length === 0) return <span className="text-xs text-muted">–</span>;
  return (
    <span className="inline-flex gap-1" aria-label={`Last ${form.length}: ${form.map((f) => FORM_WORD[f]).join(", ")}`}>
      {form.map((f, i) => (
        <span key={i} className={`inline-flex size-5 items-center justify-center rounded text-[11px] font-bold ${FORM_STYLE[f]}`} aria-hidden="true">
          {f}
        </span>
      ))}
    </span>
  );
}

/** Point-band pips: filled dots for points earned, plus the number for non-visual readers. */
export function Pips({ points, max = 4, dark = false }: { points: number; max?: number; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${points} of ${max} points`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`size-2 rounded-full ${i < points ? (dark ? "bg-accent" : "bg-emerald-600") : dark ? "bg-white/20" : "bg-line"}`}
        />
      ))}
    </span>
  );
}

export function Avatar({ name, color }: { name: string; color?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: color ?? "#586275" }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return fmt(n);
}

/** "Priya & Rohan", or "Priya, Rohan, Isha and 9 others" for long joint-winner lists. */
export function joinNames(names: string[], max = 3): string {
  if (names.length <= max) return names.join(" & ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} others`;
}
