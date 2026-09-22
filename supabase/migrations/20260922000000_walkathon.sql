-- Office Walkathon portal: database schema, row-level security and write functions.
--
-- Authorisation lives in the database: every signed-in request runs as the user, so
-- Postgres decides who can read and write. Only three things use the service role key
-- (server-side, never sent to browsers): creating and updating sign-in accounts, writing
-- the computed results tables, and seeding demo data.

-- ───────────────────────── Tables ─────────────────────────

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
  -- bands, leaguePoints, correctionDays, teamSize, finalSprintDays, lockOlderDates, highValueWarning
  rules jsonb not null,
  is_active boolean not null default true
);
create unique index seasons_one_active on public.seasons (is_active) where is_active;

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

-- Current team only; history is in membership_history.
create table public.team_members (
  season_id uuid not null references public.seasons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  primary key (season_id, user_id)
);

-- Steps count for the team a member was on that day, so a move never carries past
-- points to the new team.
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
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id, date)
);
create index step_entries_date on public.step_entries (season_id, date);

create table public.leave_records (
  season_id uuid not null references public.seasons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  created_by uuid references public.profiles (id) on delete set null,
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
  team_id text not null default '*', -- a team id, or '*' for every team
  unlocked_by uuid references public.profiles (id) on delete set null,
  unlocked_at timestamptz not null default now(),
  primary key (season_id, date, team_id)
);

create table public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  date date not null,
  reason text not null check (length(reason) between 5 and 500),
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.badge_definitions (
  id text primary key,
  name text not null,
  description text not null,
  target int not null
);

-- Computed results, rewritten by the app after every change (service role only).
create table public.fixture_results (
  fixture_id uuid primary key references public.fixtures (id) on delete cascade,
  home_points int not null,
  away_points int not null,
  outcome text,
  status text not null,
  computed_at timestamptz not null default now()
);
create table public.league_standings (
  season_id uuid not null references public.seasons (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  position int not null,
  played int not null, won int not null, drawn int not null, lost int not null,
  points int not null, activity int not null, steps bigint not null,
  primary key (season_id, team_id)
);
create table public.weekly_awards (
  season_id uuid not null references public.seasons (id) on delete cascade,
  week_index int not null,
  award text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  detail text not null,
  final boolean not null,
  primary key (season_id, week_index, award, user_id)
);
create table public.monthly_cups (
  season_id uuid not null references public.seasons (id) on delete cascade,
  month text not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  points int not null,
  status text not null,
  winner boolean not null,
  primary key (season_id, month, team_id)
);
create table public.user_badges (
  season_id uuid not null references public.seasons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null references public.badge_definitions (id) on delete cascade,
  unlocked_on date not null,
  primary key (season_id, user_id, badge_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_key text not null,
  before_json jsonb,
  after_json jsonb,
  note text
);
create index audit_log_at on public.audit_log (at desc);

insert into public.badge_definitions (id, name, description, target) values
  ('first_steps', 'First Steps', 'Your first day on the board.', 1),
  ('streak_5', '5-Day Streak', 'Five days in a row at 5,000+ steps.', 5),
  ('streak_10', '10-Day Streak', 'Ten days in a row at 5,000+ steps.', 10),
  ('streak_25', '25-Day Streak', 'Twenty-five days in a row at 5,000+ steps.', 25),
  ('club_100k', '100k Club', '100,000 steps in total.', 100000),
  ('club_250k', '250k Club', '250,000 steps in total.', 250000),
  ('goal_getter', 'Goal Getter', 'Ten days at 10,000+ steps.', 10),
  ('team_contributor', 'Team Contributor', 'Earned team points on 20 days.', 20);

-- ───────────────────────── Helper functions ─────────────────────────

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and is_admin)
$$;

create or replace function public.team_on_date(p_season uuid, p_user uuid, p_date date) returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from membership_history
  where season_id = p_season and user_id = p_user and from_date <= p_date and (to_date is null or to_date >= p_date)
  limit 1
$$;

-- Can the current user write this member's entry for this date? Admins: any date in the
-- season up to today. Team leads: their team's members, inside the correction window or on
-- a date an admin unlocked. Dates use the season's timezone.
create or replace function public.can_edit_entry(p_season uuid, p_user uuid, p_date date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  s seasons;
  v_team uuid;
  v_today date;
begin
  select * into s from seasons where id = p_season;
  if not found then return false; end if;
  if p_date < s.start_date or p_date > s.start_date + s.length_days - 1 then return false; end if;
  v_today := (now() at time zone s.timezone)::date;
  if p_date > v_today then return false; end if;
  if is_admin() then return true; end if;
  if not is_member() then return false; end if;
  v_team := team_on_date(p_season, p_user, p_date);
  if v_team is null or not exists (select 1 from teams where id = v_team and lead_user_id = auth.uid()) then
    return false;
  end if;
  if not coalesce((s.rules ->> 'lockOlderDates')::boolean, true) then return true; end if;
  if v_today - p_date <= coalesce((s.rules ->> 'correctionDays')::int, 1) then return true; end if;
  return exists (
    select 1 from unlocked_dates u
    where u.season_id = p_season and u.date = p_date and u.team_id in (v_team::text, '*')
  );
end $$;

-- Audit entries are always attributed to the signed-in user; nobody can write them directly.
create or replace function public.write_audit(p_action text, p_entity text, p_key text, p_before jsonb, p_after jsonb, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'Not allowed'; end if;
  insert into audit_log (actor_id, action, entity, entity_key, before_json, after_json, note)
  values (auth.uid(), p_action, p_entity, p_key, p_before, p_after, p_note);
end $$;

-- Safety net: log any entry/leave change made outside save_day (e.g. an admin removing leave).
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Skip rows save_day already audited, and service-role writes (demo seeding).
  if coalesce(current_setting('walkathon.audited', true), '') = 'on'
     or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return coalesce(new, old);
  end if;
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
  for each row execute function public.audit_row_change();
create trigger audit_leave_records after insert or update or delete on public.leave_records
  for each row execute function public.audit_row_change();

-- ───────────────────────── Write functions ─────────────────────────
-- These run as the calling user (security invoker), so row-level security still applies.

-- Save a team's day in one transaction. p_rows: [{ userId, steps: int|null, leave: bool }]
create or replace function public.save_day(p_season uuid, p_team uuid, p_date date, p_rows jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  v_user uuid;
  v_steps int;
  v_leave boolean;
  b_steps int;
  b_leave boolean;
  v_changed int := 0;
  v_action text;
begin
  perform set_config('walkathon.audited', 'on', true);
  for r in select value from jsonb_array_elements(p_rows) loop
    v_user := (r ->> 'userId')::uuid;
    v_leave := coalesce((r ->> 'leave')::boolean, false);
    v_steps := case when v_leave or jsonb_typeof(r -> 'steps') is distinct from 'number' then null else (r ->> 'steps')::int end;
    if team_on_date(p_season, v_user, p_date) is distinct from p_team then
      raise exception 'A row does not belong to this team.';
    end if;
    if not can_edit_entry(p_season, v_user, p_date) then
      raise exception 'This date is locked for your team.';
    end if;
    if v_steps < 0 then raise exception 'Steps must be zero or more.'; end if;

    select steps into b_steps from step_entries where season_id = p_season and user_id = v_user and date = p_date;
    b_leave := exists (select 1 from leave_records where season_id = p_season and user_id = v_user and date = p_date);
    if b_steps is not distinct from v_steps and b_leave = v_leave then continue; end if;

    if v_leave then
      delete from step_entries where season_id = p_season and user_id = v_user and date = p_date;
      insert into leave_records (season_id, user_id, date, created_by) values (p_season, v_user, p_date, auth.uid())
        on conflict do nothing;
    else
      delete from leave_records where season_id = p_season and user_id = v_user and date = p_date;
      if v_steps is null then
        delete from step_entries where season_id = p_season and user_id = v_user and date = p_date;
      else
        insert into step_entries (season_id, user_id, date, steps, updated_by, updated_at)
        values (p_season, v_user, p_date, v_steps, auth.uid(), now())
        on conflict (season_id, user_id, date)
          do update set steps = excluded.steps, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
      end if;
    end if;

    v_action := case
      when b_steps is null and not b_leave then 'create'
      when v_steps is null and not v_leave then 'clear'
      else 'update' end;
    perform write_audit(v_action, 'step_entry', v_user::text || '|' || p_date::text,
      jsonb_build_object('steps', b_steps, 'leave', b_leave), jsonb_build_object('steps', v_steps, 'leave', v_leave));
    v_changed := v_changed + 1;
  end loop;
  return v_changed;
end $$;

-- Put a member on a team (or no team) from p_effective onwards. Earlier days keep their team.
-- Reads profiles.active, so update the profile first when deactivating.
create or replace function public.set_member_team(p_season uuid, p_user uuid, p_team uuid, p_effective date)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_active boolean;
  v_was uuid;
  v_now uuid;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  select active into v_active from profiles where id = p_user;
  select team_id into v_was from membership_history where season_id = p_season and user_id = p_user and to_date is null;
  v_now := case when v_active then p_team end;
  if v_was is distinct from v_now then
    delete from membership_history where season_id = p_season and user_id = p_user and from_date >= p_effective;
    update membership_history set to_date = p_effective - 1
      where season_id = p_season and user_id = p_user and (to_date is null or to_date >= p_effective);
    if v_now is not null then
      insert into membership_history (season_id, user_id, team_id, from_date) values (p_season, p_user, v_now, p_effective);
    end if;
  end if;
  delete from team_members where season_id = p_season and user_id = p_user;
  if p_team is not null then
    insert into team_members (season_id, user_id, team_id) values (p_season, p_user, p_team);
  end if;
  update teams set lead_user_id = null
    where season_id = p_season and lead_user_id = p_user and id is distinct from v_now;
end $$;

-- Replace the whole fixture list, and fill in default challenges for weeks without one.
-- p_fixtures: [{ weekIndex, homeTeamId, awayTeamId }]
create or replace function public.replace_fixtures(p_season uuid, p_fixtures jsonb, p_week_count int)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  delete from fixtures where season_id = p_season;
  insert into fixtures (season_id, week_index, home_team_id, away_team_id)
    select p_season, (f ->> 'weekIndex')::int, (f ->> 'homeTeamId')::uuid, (f ->> 'awayTeamId')::uuid
    from jsonb_array_elements(p_fixtures) f;
  delete from weekly_challenges where season_id = p_season and week_index >= p_week_count;
  insert into weekly_challenges (season_id, week_index, type)
    select p_season, w, (array['five_day_move', 'weekend_walk', 'ten_k_day', 'streak_builder'])[w % 4 + 1]
    from generate_series(0, p_week_count - 1) w
    on conflict do nothing;
end $$;

-- Change one week's pairings. p_fixtures: [{ homeTeamId, awayTeamId }]
create or replace function public.set_week_fixtures(p_season uuid, p_week int, p_fixtures jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  delete from fixtures where season_id = p_season and week_index = p_week;
  insert into fixtures (season_id, week_index, home_team_id, away_team_id)
    select p_season, p_week, (f ->> 'homeTeamId')::uuid, (f ->> 'awayTeamId')::uuid
    from jsonb_array_elements(p_fixtures) f;
end $$;

-- Save season settings. When the start date moves, team history moves with it; pass
-- p_fixtures (and p_week_count) to rebuild the schedule for new dates.
create or replace function public.update_season(
  p_season uuid, p_name text, p_start date, p_length int, p_timezone text, p_rules jsonb,
  p_fixtures jsonb default null, p_week_count int default null
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_old_start date;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  perform now() at time zone p_timezone; -- rejects unknown timezones
  select start_date into v_old_start from seasons where id = p_season;
  update seasons set name = p_name, start_date = p_start, length_days = p_length, timezone = p_timezone, rules = p_rules
    where id = p_season;
  if v_old_start is distinct from p_start then
    delete from membership_history where season_id = p_season and to_date is not null and to_date < p_start;
    update membership_history set from_date = p_start
      where season_id = p_season and (from_date = v_old_start or from_date < p_start);
  end if;
  if p_fixtures is not null then
    perform replace_fixtures(p_season, p_fixtures, p_week_count);
  end if;
end $$;

create or replace function public.decide_correction(p_id uuid, p_approve boolean)
returns void language plpgsql security invoker set search_path = public as $$
declare
  req correction_requests;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  select * into req from correction_requests where id = p_id;
  if not found or req.status <> 'pending' then return; end if;
  update correction_requests
    set status = case when p_approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now()
    where id = p_id;
  if p_approve then
    insert into unlocked_dates (season_id, date, team_id, unlocked_by)
      values (req.season_id, req.date, req.team_id::text, auth.uid())
      on conflict do nothing;
  end if;
  perform write_audit(case when p_approve then 'approve' else 'decline' end, 'correction_request', p_id::text,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', case when p_approve then 'approved' else 'declined' end));
end $$;

revoke execute on function public.save_day, public.set_member_team, public.replace_fixtures, public.set_week_fixtures,
  public.update_season, public.decide_correction, public.write_audit, public.can_edit_entry
  from public, anon;
grant execute on function public.save_day, public.set_member_team, public.replace_fixtures, public.set_week_fixtures,
  public.update_season, public.decide_correction, public.write_audit, public.can_edit_entry
  to authenticated;

-- ───────────────────────── Table access ─────────────────────────
-- Explicit grants, so this works even with "Automatically expose new tables" switched off.
-- Signed-out visitors (anon) get nothing; row-level security below decides what signed-in
-- users can actually see and change.

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.is_member, public.is_admin, public.team_on_date to authenticated, service_role;

-- ───────────────────────── Row-level security ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'seasons', 'teams', 'team_members', 'membership_history', 'step_entries', 'leave_records',
    'fixtures', 'weekly_challenges', 'unlocked_dates', 'correction_requests', 'badge_definitions',
    'fixture_results', 'league_standings', 'weekly_awards', 'monthly_cups', 'user_badges', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Active members can read the competition.
  foreach t in array array[
    'profiles', 'seasons', 'teams', 'team_members', 'membership_history', 'step_entries', 'leave_records',
    'fixtures', 'weekly_challenges', 'unlocked_dates', 'badge_definitions',
    'fixture_results', 'league_standings', 'weekly_awards', 'monthly_cups', 'user_badges'
  ] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_member())', t);
  end loop;

  -- Admins manage configuration.
  foreach t in array array[
    'profiles', 'seasons', 'teams', 'team_members', 'membership_history', 'fixtures', 'weekly_challenges', 'unlocked_dates'
  ] loop
    execute format('create policy "admins write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Entries and leave: team leads inside the correction window, admins any time.
create policy "leads and admins write entries" on public.step_entries for all to authenticated
  using (public.can_edit_entry(season_id, user_id, date)) with check (public.can_edit_entry(season_id, user_id, date));
create policy "leads and admins write leave" on public.leave_records for all to authenticated
  using (public.can_edit_entry(season_id, user_id, date)) with check (public.can_edit_entry(season_id, user_id, date));

-- Correction requests: leads ask for their own team; admins see and decide all.
create policy "read own team or admin" on public.correction_requests for select to authenticated
  using (public.is_admin() or exists (select 1 from public.teams t where t.id = team_id and t.lead_user_id = auth.uid()));
create policy "leads request" on public.correction_requests for insert to authenticated
  with check (
    requested_by = auth.uid() and status = 'pending' and public.is_member()
    and exists (select 1 from public.teams t where t.id = team_id and t.lead_user_id = auth.uid())
  );
create policy "admins decide" on public.correction_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins read audit" on public.audit_log for select to authenticated using (public.is_admin());
-- Results tables and audit_log have no write policies: only the service role and the
-- security-definer audit functions write to them.
