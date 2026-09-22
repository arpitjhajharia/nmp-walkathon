import type { ISODate } from "./dates.ts";

export interface Band {
  /** Minimum steps (inclusive) to reach this band. */
  min: number;
  points: number;
}

export interface Settings {
  seasonName: string;
  startDate: ISODate;
  lengthDays: number;
  timezone: string;
  bands: Band[];
  leaguePoints: { win: number; draw: number; loss: number };
  /** Days after a week ends during which its result is shown as provisional while corrections come in. */
  correctionDays: number;
  teamSize: number;
  finalSprintDays: number;
  lockOlderDates: boolean;
  highValueWarning: number;
}

export interface Team {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
  leadUserId: string | null;
}

export interface Member {
  id: string;
  name: string;
  teamId: string | null;
  isAdmin: boolean;
  active: boolean;
}

/** A spell on a team. Steps count for the team the member was on that day. */
export interface Membership {
  userId: string;
  teamId: string;
  from: ISODate;
  /** Last day on the team (inclusive), or null while current. */
  to: ISODate | null;
}

export interface Entry {
  userId: string;
  date: ISODate;
  steps: number;
}

export interface Leave {
  userId: string;
  date: ISODate;
}

export interface Fixture {
  id: string;
  weekIndex: number;
  homeTeamId: string;
  awayTeamId: string;
}

export type ChallengeType = "five_day_move" | "weekend_walk" | "streak_builder" | "ten_k_day";

export interface Challenge {
  weekIndex: number;
  type: ChallengeType;
}

export interface Snapshot {
  settings: Settings;
  teams: Team[];
  members: Member[];
  entries: Entry[];
  leaves: Leave[];
  fixtures: Fixture[];
  challenges: Challenge[];
  /** Team history. Members without any fall back to their current team for the whole season. */
  memberships?: Membership[];
}
