import { cache } from "react";
import type { Season } from "../engine/engine.ts";
import { userDb } from "../supabase/server";
import { compute, loadData, type UserRecord } from "./repo.ts";
import { currentSeason } from "./data";

export interface Portal {
  season: Season;
  users: Map<string, UserRecord>;
  entryMeta: Map<string, { updatedBy: string | null; updatedAt: string }>;
  nameOf: (userId: string | null | undefined) => string;
}

/** Loaded and computed once per request; every page reads standings, fixtures and awards from here. */
export const getPortal = cache(async (): Promise<Portal> => {
  const data = await loadData(await userDb(), await currentSeason());
  const users = new Map(data.users.map((u) => [u.id, u]));
  return { season: compute(data), users, entryMeta: data.entryMeta, nameOf: (id) => (id ? users.get(id)?.name ?? "Unknown" : "System") };
});
