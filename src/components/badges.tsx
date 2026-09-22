import { Footprints, Medal, Sparkles, Target, Users, type LucideIcon } from "lucide-react";

export const BADGE_ICONS: Record<string, LucideIcon> = {
  first_steps: Footprints,
  streak_5: Sparkles,
  streak_10: Sparkles,
  streak_25: Sparkles,
  club_100k: Medal,
  club_250k: Medal,
  goal_getter: Target,
  team_contributor: Users,
};
