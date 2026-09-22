// SQLite schema. A Postgres/Supabase equivalent lives in supabase/schema.sql.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  length_days INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  lead_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (season_id, slug)
);

CREATE TABLE IF NOT EXISTS team_members (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (season_id, user_id)
);

-- Team history: steps count for the team a member was on that day, so moving a member
-- never moves their past points. team_members above holds the current team only.
CREATE TABLE IF NOT EXISTS membership_history (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  from_date TEXT NOT NULL,
  to_date TEXT,
  PRIMARY KEY (season_id, user_id, from_date)
);

CREATE TABLE IF NOT EXISTS step_entries (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  steps INTEGER NOT NULL CHECK (steps >= 0),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (season_id, user_id, date)
);

CREATE TABLE IF NOT EXISTS leave_records (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (season_id, user_id, date)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week_index INTEGER NOT NULL,
  home_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weekly_challenges (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week_index INTEGER NOT NULL,
  type TEXT NOT NULL,
  PRIMARY KEY (season_id, week_index)
);

CREATE TABLE IF NOT EXISTS unlocked_dates (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  team_id TEXT NOT NULL DEFAULT '*',
  unlocked_by TEXT,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (season_id, date, team_id)
);

CREATE TABLE IF NOT EXISTS correction_requests (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS badge_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  target INTEGER NOT NULL
);

-- Materialised results: rewritten after every save so reports and exports stay current.
CREATE TABLE IF NOT EXISTS fixture_results (
  fixture_id TEXT PRIMARY KEY REFERENCES fixtures(id) ON DELETE CASCADE,
  home_points INTEGER NOT NULL,
  away_points INTEGER NOT NULL,
  outcome TEXT,
  status TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS league_standings (
  season_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  played INTEGER NOT NULL,
  won INTEGER NOT NULL,
  drawn INTEGER NOT NULL,
  lost INTEGER NOT NULL,
  points INTEGER NOT NULL,
  activity INTEGER NOT NULL,
  steps INTEGER NOT NULL,
  PRIMARY KEY (season_id, team_id)
);

CREATE TABLE IF NOT EXISTS weekly_awards (
  season_id TEXT NOT NULL,
  week_index INTEGER NOT NULL,
  award TEXT NOT NULL,
  user_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  final INTEGER NOT NULL,
  PRIMARY KEY (season_id, week_index, award, user_id)
);

CREATE TABLE IF NOT EXISTS monthly_cups (
  season_id TEXT NOT NULL,
  month TEXT NOT NULL,
  team_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  status TEXT NOT NULL,
  winner INTEGER NOT NULL,
  PRIMARY KEY (season_id, month, team_id)
);

CREATE TABLE IF NOT EXISTS user_badges (
  season_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  badge_id TEXT NOT NULL,
  unlocked_on TEXT NOT NULL,
  PRIMARY KEY (season_id, user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_entries_date ON step_entries (season_id, date);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log (at DESC);
`;
