import type { Metadata } from "next";
import Link from "next/link";
import { TeamBadge } from "@/components/team";
import { Avatar, Card, PageHeader, fmt } from "@/components/ui";
import { getPortal } from "@/lib/server/season";

export const metadata: Metadata = { title: "Players" };

export default async function PlayersPage() {
  const { season: s } = await getPortal();
  return (
    <>
      <PageHeader eyebrow={`${s.participants.length} walkers`} title="Players">
        Tap a name to see their daily steps, streaks, badges and challenge progress.
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2">
        {s.teams.map((t) => {
          const members = [...(s.membersByTeam.get(t.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
          return (
            <Card key={t.id} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line-2 px-4 py-3">
                <TeamBadge team={t} link />
                <span className="text-xs text-muted">{members.length} members</span>
              </div>
              <ul className="divide-y divide-line-2">
                {members.map((m) => {
                  const st = s.stats.get(m.id);
                  return (
                    <li key={m.id}>
                      <Link href={`/players/${m.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-line-2/60">
                        <Avatar name={m.name} color={t.color} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{m.name}</span>
                          {t.leadUserId === m.id && <span className="block text-xs text-muted">Captain</span>}
                        </span>
                        <span className="tnum text-right text-sm">
                          <span className="block font-semibold">{fmt(st?.totalSteps ?? 0)}</span>
                          <span className="block text-xs text-muted">steps</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
