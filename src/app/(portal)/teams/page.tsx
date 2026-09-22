import type { Metadata } from "next";
import Link from "next/link";
import { TeamIcon } from "@/components/team";
import { Card, PageHeader } from "@/components/ui";
import { getPortal } from "@/lib/server/season";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage() {
  const { season: s, nameOf } = await getPortal();
  return (
    <>
      <PageHeader eyebrow={`${s.teams.length} teams · ${s.participants.length} walkers`} title="Teams" />
      <div className="grid gap-4 sm:grid-cols-2">
        {s.teams.map((t) => {
          const row = s.standings.find((r) => r.teamId === t.id)!;
          const members = s.membersByTeam.get(t.id) ?? [];
          return (
            <Link key={t.id} href={`/teams/${t.slug}`} className="group block rounded-2xl focus-visible:outline-offset-4">
              <Card as="article" className="overflow-hidden transition-shadow group-hover:shadow-md">
                <div className="h-1.5" style={{ backgroundColor: t.color }} />
                <div className="flex items-center gap-4 p-5">
                  <TeamIcon team={t} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-2xl font-bold uppercase leading-tight">
                      {t.name}
                    </p>
                    <p className="text-sm text-muted">Captain: {t.leadUserId ? nameOf(t.leadUserId) : "Not chosen yet"}</p>
                  </div>
                  <div className="text-right">
                    <p className="tnum font-display text-3xl font-bold leading-none">#{row.position}</p>
                    <p className="tnum text-xs text-muted">{row.points} pts</p>
                  </div>
                </div>
                <p className="border-t border-line-2 px-5 py-3 text-sm text-muted">{members.map((m) => m.name.split(" ")[0]).join(" · ") || "No members yet"}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
