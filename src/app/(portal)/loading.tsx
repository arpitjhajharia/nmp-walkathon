export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="skeleton h-40 w-full rounded-3xl" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="skeleton h-36" />
        <div className="skeleton h-36" />
      </div>
      <div className="skeleton h-64" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
