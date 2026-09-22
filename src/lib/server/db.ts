import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA } from "./schema.sql.ts";

const g = globalThis as unknown as { __walkathonDb?: DatabaseSync };

export function isDemoMode(): boolean {
  const flag = process.env.DEMO_MODE ?? (process.env.NODE_ENV === "production" ? "false" : "true");
  return flag === "true";
}

export function db(): DatabaseSync {
  if (!g.__walkathonDb) {
    const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "walkathon.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const conn = new DatabaseSync(file);
    conn.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    conn.exec(SCHEMA);
    g.__walkathonDb = conn;
  }
  return g.__walkathonDb;
}

/** Run fn inside a transaction; rolls back on any error. */
export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

type Param = string | number | null;

export function all<T>(sql: string, ...params: Param[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: Param[]): void {
  db().prepare(sql).run(...params);
}
