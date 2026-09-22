import { Tabs } from "@/components/tabs";
import { Card, EmptyState } from "@/components/ui";
import { auditLog } from "@/lib/server/data";
import { getPortal } from "@/lib/server/season";

const FILTERS: { id: string; label: string; entities?: string[] }[] = [
  { id: "all", label: "Everything" },
  { id: "step_entry", label: "Step entries", entities: ["step_entry", "step_entries", "leave_records"] },
  { id: "user", label: "Members", entities: ["user", "team"] },
  { id: "season", label: "Settings", entities: ["season", "fixtures", "weekly_challenge", "demo"] },
];

function describe(v: unknown, entity: string): string {
  if (v === null || v === undefined) return "–";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (entity === "leave_records") return "On leave";
    if ("steps" in o) return o.leave ? "On leave" : o.steps === null ? "Not entered" : `${Number(o.steps).toLocaleString("en-US")} steps`;
  }
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.id === sp.entity) ? String(sp.entity) : "all";
  const { season: s, nameOf } = await getPortal();
  const rows = await auditLog(200, FILTERS.find((f) => f.id === filter)?.entities);
  const tz = s.settings.timezone;
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const subject = (entity: string, key: string) => {
    if (entity === "step_entry" || entity === "step_entries" || entity === "leave_records") {
      const [userId, date] = key.split("|");
      return `${nameOf(userId)} · ${date}`;
    }
    if (entity === "user") return nameOf(key);
    return key;
  };

  return (
    <>
      <Tabs label="Filter audit log" active={filter} tabs={FILTERS.map((f) => ({ id: f.id, label: f.label, href: f.id === "all" ? "/admin/audit" : `/admin/audit?entity=${f.id}` }))} />
      {rows.length === 0 ? (
        <EmptyState title="Nothing logged yet" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Audit log, newest first</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-2.5">When ({tz})</th>
                <th scope="col" className="px-3 py-2.5">Who</th>
                <th scope="col" className="px-3 py-2.5">What</th>
                <th scope="col" className="px-3 py-2.5">Before</th>
                <th scope="col" className="px-4 py-2.5">After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-2 align-top last:border-0">
                  <td className="tnum whitespace-nowrap px-4 py-2 text-muted">{when(r.at)}</td>
                  <td className="px-3 py-2 font-semibold">{nameOf(r.actorId)}</td>
                  <td className="px-3 py-2">
                    <span className="font-semibold capitalize">{r.action.replace("_", " ")}</span> {r.entity.replace("_", " ")}
                    <span className="block text-xs text-muted">{r.note ?? subject(r.entity, r.entityKey)}</span>
                  </td>
                  <td className="px-3 py-2 text-muted">{describe(r.before, r.entity)}</td>
                  <td className="px-4 py-2">{describe(r.after, r.entity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
