import { cache } from "react";
import type { Season } from "../engine/engine.ts";
import { computeCurrent, listUsers, type UserRecord } from "./data.ts";

export interface Portal {
  season: Season;
  users: Map<string, UserRecord>;
  nameOf: (userId: string | null | undefined) => string;
}

/** Computed once per request; every page reads standings, fixtures and awards from here. */
export const getPortal = cache((): Portal => {
  const season = computeCurrent();
  const users = new Map(listUsers().map((u) => [u.id, u]));
  return { season, users, nameOf: (id) => (id ? users.get(id)?.name ?? "Unknown" : "System") };
});
