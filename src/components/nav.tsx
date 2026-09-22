"use client";

import {
  Award,
  BookOpen,
  CalendarDays,
  Footprints,
  Home,
  KeyRound,
  LayoutList,
  LogOut,
  Medal,
  Menu,
  PencilLine,
  Settings,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
}

const BASE: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/standings", label: "Standings", icon: LayoutList },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/leaderboard", label: "Leaders", icon: Medal },
  { href: "/awards", label: "Awards", icon: Award },
  { href: "/me", label: "My progress", icon: TrendingUp },
  { href: "/rules", label: "Rules", icon: BookOpen },
];

const ACCOUNT: Item = { href: "/account", label: "Account", icon: KeyRound };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav({
  userName,
  roleLabel,
  canEnter,
  isAdmin,
  dayLabel,
  signOut,
}: {
  userName: string;
  roleLabel: string;
  canEnter: boolean;
  isAdmin: boolean;
  dayLabel: string;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const items: Item[] = [
    ...BASE,
    ...(canEnter ? [{ href: "/entry", label: "Enter steps", icon: PencilLine }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: Settings }] : []),
  ];
  const menuItems = [...items, ACCOUNT];
  const bottom: Item[] = [
    BASE[0],
    BASE[1],
    canEnter ? { href: "/entry", label: "Enter", icon: PencilLine } : BASE[2],
    BASE[4],
  ];

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 bg-night text-white shadow-[0_1px_0_rgba(255,255,255,0.06)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Walkathon home">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-night">
              <Footprints className="size-4.5" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="font-display text-xl font-bold uppercase tracking-wide">Walkathon</span>
          </Link>
          <span className="tnum hidden rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white/85 sm:inline">{dayLabel}</span>
          <nav aria-label="Main" className="ml-auto hidden lg:block">
            <ul className="flex items-center gap-0.5">
              {items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={isActive(pathname, it.href) ? "page" : undefined}
                    className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors ${
                      isActive(pathname, it.href) ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                    } ${it.href === "/entry" ? "text-accent" : ""}`}
                  >
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto inline-flex size-10 items-center justify-center rounded-lg hover:bg-white/10 lg:ml-2"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="site-menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu" id="site-menu">
          <button type="button" className="absolute inset-0 bg-night/60" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(22rem,88vw)] flex-col bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{userName}</p>
                <p className="text-xs text-muted">{roleLabel}</p>
              </div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-line-2" aria-label="Close menu">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="All sections" className="flex-1 overflow-y-auto p-2">
              <ul>
                {menuItems.map((it) => (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={isActive(pathname, it.href) ? "page" : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold ${
                        isActive(pathname, it.href) ? "bg-line-2 text-ink" : "text-ink-2 hover:bg-line-2"
                      }`}
                    >
                      <it.icon className="size-5 text-muted" aria-hidden="true" />
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <form
              action={async () => {
                await signOut();
                window.location.assign("/login");
              }}
              className="border-t border-line p-3"
            >
              <button type="submit" className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-ink-2 hover:bg-line-2">
                <LogOut className="size-5 text-muted" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}

      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {bottom.map((it) => {
            const active = isActive(pathname, it.href);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-ink" : "text-muted"}`}
                >
                  <span className={`inline-flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-line-2" : ""} ${it.href === "/entry" ? "bg-night text-accent" : ""}`}>
                    <it.icon className="size-5" aria-hidden="true" />
                  </span>
                  {it.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted" aria-label="More sections">
              <span className="inline-flex h-7 w-12 items-center justify-center">
                <Menu className="size-5" aria-hidden="true" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
