import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-7xl font-bold text-night">404</p>
      <p className="mt-2 font-display text-2xl font-bold uppercase">Out of bounds</p>
      <p className="mt-1 text-sm text-muted">That page isn&apos;t part of the walkathon.</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-night px-4 text-sm font-semibold text-white">Back to home</Link>
    </main>
  );
}
