import { Anchor, Bird, Compass, Flame, Footprints, Mountain, Rocket, Shield, Star, Sun, Wind, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Team } from "@/lib/engine/types";

export const TEAM_ICONS: Record<string, LucideIcon> = {
  rocket: Rocket,
  footprints: Footprints,
  flame: Flame,
  compass: Compass,
  mountain: Mountain,
  zap: Zap,
  wind: Wind,
  star: Star,
  shield: Shield,
  sun: Sun,
  bird: Bird,
  anchor: Anchor,
};

export function TeamIcon({ team, size = "md" }: { team: Pick<Team, "color" | "icon" | "name">; size?: "sm" | "md" | "lg" | "xl" }) {
  const Icon = TEAM_ICONS[team.icon] ?? Star;
  const box = { sm: "size-6 rounded-md", md: "size-8 rounded-lg", lg: "size-11 rounded-xl", xl: "size-16 rounded-2xl" }[size];
  const icon = { sm: "size-3.5", md: "size-4.5", lg: "size-6", xl: "size-9" }[size];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center text-white shadow-sm ${box}`} style={{ backgroundColor: team.color }} aria-hidden="true">
      <Icon className={icon} strokeWidth={2.25} />
    </span>
  );
}

export function TeamBadge({ team, size = "md", link = false, className = "" }: { team: Team; size?: "sm" | "md" | "lg"; link?: boolean; className?: string }) {
  const text = { sm: "text-sm", md: "text-[15px]", lg: "text-lg" }[size];
  const inner = (
    <>
      <TeamIcon team={team} size={size} />
      <span className={`truncate font-semibold ${text}`}>{team.name}</span>
    </>
  );
  if (link)
    return (
      <Link href={`/teams/${team.slug}`} className={`inline-flex min-w-0 items-center gap-2 hover:underline ${className}`}>
        {inner}
      </Link>
    );
  return <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>{inner}</span>;
}
