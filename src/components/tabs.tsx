import Link from "next/link";

export function Tabs({ tabs, active, label }: { tabs: { id: string; label: string; href: string }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-xl bg-line-2 p-1">
        {tabs.map((t) => (
          <li key={t.id}>
            <Link
              href={t.href}
              aria-current={t.id === active ? "page" : undefined}
              className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors ${
                t.id === active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
