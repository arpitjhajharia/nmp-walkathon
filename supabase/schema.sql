-- Walkathon portal: Postgres / Supabase schema.
--
-- This mirrors the SQLite schema the app runs on today (src/lib/server/schema.sql.ts) and is
-- the starting point for moving to Supabase. Users map to auth.users; roles come from the
-- profiles table and team leads from teams.lead_user_id. Results tables are materialised by
-- the app after every save, so only raw inputs need write policies.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  is_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  length_days int not null check (length_days between 7 and 366),
  timezone text not null default 'Asia/Kolkata',
  rules jsonb not null,            -- bands, leaguePoints, correctionDays, teamSize, finalSprintDays, lockOlderDates, highValueWarning
  is_active boolean not null default true
);
create unique index one_active_season on public.seasons (is_active) where is_active;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  slug text not null,
  name text not null,
  color text not null,
  icon text not null,
  lead_user_id uuid references public.profiles (id) on delete set null,
  sort_order int not null default 0,
  unique (season_id, slug)
);

create table public.team_members (
  season_id uuid not null references public.seasons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  primary key (season_id, user_id)
);

-- Team history: steps count for the team a member was on that day, so a move never
-- carries past points to the new team. team_members holds the current team only.
create table public.membership_history (
  season_id uuid not null references public.seasons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  from_date date not null,
  to_date date,
  primary key (season_id, user_id, from_date)
);

create table public.step_entries (
  season_id uuid not null references public.seasons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  steps int not null check (steps >= 0),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id, date)
);

create table public.leave_records (
  season_id uuid not null references public.seasons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (season_id, user_id, date)
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  week_index int not null,
  home_team_id uuid not null references public.teams (id) on delete cascade,
  away_team_id uuid not null references public.teams (id) on delete cascade
);

create table public.weekly_challenges (
  season_id uuid not null references public.seasons (id) on delete cascade,
  week_index int not null,
  type text not null check (type in ('five_day_move', 'weekend_walk', 'streak_builder', 'ten_k_day')),
  primary key (season_id, week_index)
);

create table public.unlocked_dates (
  season_id uuid not null references public.seasons (id) on delete cascade,
  date date not null,
  team_id text not null default '*',       -- a team id, or '*' for all teams
  unlocked_by uuid references public.profiles (id),
  unlocked_at timestamptz not null default now(),
  primary key (season_id, date, team_id)
);

create table public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  date date not null,
  reason text not null,
  requested_by uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.badge_definitions (
  id text primary key,
  name text not null,
  description text not null,
  target int not null
);

-- Materialised results (written by the app's recompute step)
create table public.fixture_results (
  fixture_id uuid primary key references public.fixtures (id) on delete cascade,
  home_points int not null,
  away_points int not null,
  outcome text,
  status text not null,
  computed_at timestamptz not null default now()
);
create table public.league_standings (
  season_id uuid not null, team_id uuid not null, position int not null,
  played int not null, won int not null, drawn int not null, lost int not null,
  points int not null, activity int not null, steps bigint not null,
  primary key (season_id, team_id)
);
create table public.weekly_awards (
  season_id uuid not null, week_index int not null, award text not null, user_id uuid not null,
  detail text not null, final boolean not null,
  primary key (season_id, week_index, award, user_id)
);
create table public.monthly_cups (
  season_id uuid not null, month text not null, team_id uuid not null,
  points int not null, status text not null, winner boolean not null,
  primary key (season_id, month, team_id)
);
create table public.user_badges (
  season_id uuid not null, user_id uuid not null, badge_id text not null references public.badge_definitions (id),
  unlocked_on date not null,
  primary key (season_id, user_id, badge_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity text not null,
  entity_key text not null,
  before_json jsonb,
  after_json jsonb,
  note text
);

-- ───────── Helpers for row-level security ─────────

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin and active from profiles where id = auth.uid()), false)
$$;

-- True when the current user leads the member's team and the date is inside the correction
-- window (or unlocked by an admin). Dates are compared in the season's timezone.
create or replace function public.can_edit_entry(p_season uuid, p_user uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from membership_history tm
    join teams t on t.id = tm.team_id
    join seasons s on s.id = tm.season_id
    where tm.season_id = p_season and tm.user_id = p_user and t.lead_user_id = auth.uid()
      and p_date >= tm.from_date and (tm.to_date is null or p_date <= tm.to_date)
      and p_date between s.start_date and s.start_date + s.length_days - 1
      and p_date <= (now() at time zone s.timezone)::date
      and (
        not coalesce((s.rules ->> 'lockOlderDates')::boolean, true)
        or (now() at time zone s.timezone)::date - p_date <= coalesce((s.rules ->> 'correctionDays')::int, 1)
        or exists (select 1 from unlocked_dates u where u.season_id = p_season and u.date = p_date and u.team_id in (t.id::text, '*'))
      )
  )
$$;

-- ───────── Row-level security ─────────

alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.membership_history enable row level security;
alter table public.step_entries enable row level security;
alter table public.leave_records enable row level security;
alter table public.fixtures enable row level security;
alter table public.weekly_challenges enable row level security;
alter table public.unlocked_dates enable row level security;
alter table public.correction_requests enable row level security;
alter table public.badge_definitions enable row level security;
alter table public.fixture_results enable row level security;
alter table public.league_standings enable row level security;
alter table public.weekly_awards enable row level security;
alter table public.monthly_cups enable row level security;
alter table public.user_badges enable row level security;
alter table public.audit_log enable row level security;

-- Everyone signed in can read competition data.
do $$
declare t text;
begin
  foreach t in array array['profiles','seasons','teams','team_members','membership_history','step_entries','leave_records','fixtures',
    'weekly_challenges','badge_definitions','fixture_results','league_standings','weekly_awards','monthly_cups','user_badges']
  loop
    execute format('create policy "read for signed-in users" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Admins manage configuration.
do $$
declare t text;
begin
  foreach t in array array['profiles','seasons','teams','team_members','membership_history','fixtures','weekly_challenges','unlocked_dates',
    'badge_definitions','fixture_results','league_standings','weekly_awards','monthly_cups','user_badges']
  loop
    execute format('create policy "admins write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Team leads (and admins) write entries and leave inside the correction window.
create policy "leads write entries" on public.step_entries for all to authenticated
  using (public.can_edit_entry(season_id, user_id, date)) with check (public.can_edit_entry(season_id, user_id, date));
create policy "leads write leave" on public.leave_records for all to authenticated
  using (public.can_edit_entry(season_id, user_id, date)) with check (public.can_edit_entry(season_id, user_id, date));

-- Correction requests: leads create for their team; admins decide.
create policy "read own or admin" on public.correction_requests for select to authenticated
  using (public.is_admin() or requested_by = auth.uid());
create policy "leads request" on public.correction_requests for insert to authenticated
  with check (requested_by = auth.uid() and exists (select 1 from teams t where t.id = team_id and t.lead_user_id = auth.uid()));
create policy "admins decide" on public.correction_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins read audit" on public.audit_log for select to authenticated using (public.is_admin());
create policy "unlocks readable" on public.unlocked_dates for select to authenticated using (true);

-- ───────── Audit trail for entries (who changed what, and when) ─────────

create or replace function public.audit_entry_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor_id, action, entity, entity_key, before_json, after_json)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.user_id, old.user_id)::text || '|' || coalesce(new.date, old.date)::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_step_entries after insert or update or delete on public.step_entries
  for each row execute function public.audit_entry_change();
create trigger audit_leave_records after insert or update or delete on public.leave_records
  for each row execute function public.audit_entry_change();
