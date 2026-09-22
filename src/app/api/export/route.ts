import { currentUser } from "@/lib/server/auth";
import { exportRows } from "@/lib/server/data";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const user = await currentUser();
  if (!user?.isAdmin) return new Response("Not allowed", { status: 403 });
  const rows = exportRows();
  const header = ["date", "name", "email", "team", "steps", "on_leave", "points", "updated_by", "updated_at"];
  const body = [header.join(","), ...rows.map((r) => [r.date, r.name, r.email, r.team, r.steps, r.onLeave, r.points, r.updatedBy, r.updatedAt].map(cell).join(","))].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="walkathon-entries-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
