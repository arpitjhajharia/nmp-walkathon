-- Open, read-only website: anyone can view the competition without signing in.
-- Only admins sign in, and only admins can change anything.
--
-- • People no longer need sign-in accounts. An admin's profile links to their account
--   through profiles.auth_user_id.
-- • Visitors can read competition data but never email addresses or the audit log.
-- • Team leads, correction requests and date locks are gone: admins can correct any day
--   in the season up to today.

-- ───────────────────────── People and accounts ─────────────────────────

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null;
update public.profiles p set auth_user_id = p.id
  where p.is_admin and p.auth_user_id is null and exists (select 1 from auth.users u where u.id = p.id);

-- The signed-in admin's profile id (null for visitors and anyone who isn't an active person).
create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where auth_user_id = auth.uid() and active and is_admin)
$$;

-- Admin-only view of contact details (visitors can't read email columns at all).
create or replace function public.member_contacts()
returns table (id uuid, email text, auth_user_id uuid)
language sql stable security definer set search_path = public as $$
  select id, email, auth_user_id from profiles where public.is_admin()
$$;

-- ───────────────────────── Write rules: admins only ─────────────────────────

create or replace function public.can_edit_entry(p_season uuid, p_user uuid, p_date date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  s seasons;
begin
  if not is_admin() then return false; end if;
  select * into s from seasons where id = p_season;
  if not found then return false; end if;
  return p_date between s.start_date and s.start_date + s.length_days - 1
     and p_date <= (now() at time zone s.timezone)::date;
end $$;

create or replace function public.write_audit(p_action text, p_entity text, p_key text, p_before jsonb, p_after jsonb, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  insert into audit_log (actor_id, action, entity, entity_key, before_json, after_json, note)
  values (current_profile_id(), p_action, p_entity, p_key, p_before, p_after, p_note);
end $$;

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
    current_profile_id(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.user_id, old.user_id)::text || '|' || coalesce(new.date, old.date)::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

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
  v_me uuid := current_profile_id();
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
      raise exception 'Only admins can change steps, for dates in the season up to today.';
    end if;
    if v_steps < 0 then raise exception 'Steps must be zero or more.'; end if;

    select steps into b_steps from step_entries where season_id = p_season and user_id = v_user and date = p_date;
    b_leave := exists (select 1 from leave_records where season_id = p_season and user_id = v_user and date = p_date);
    if b_steps is not distinct from v_steps and b_leave = v_leave then continue; end if;

    if v_leave then
      delete from step_entries where season_id = p_season and user_id = v_user and date = p_date;
      insert into leave_records (season_id, user_id, date, created_by) values (p_season, v_user, p_date, v_me)
        on conflict do nothing;
    else
      delete from leave_records where season_id = p_season and user_id = v_user and date = p_date;
      if v_steps is null then
        delete from step_entries where season_id = p_season and user_id = v_user and date = p_date;
      else
        insert into step_entries (season_id, user_id, date, steps, updated_by, updated_at)
        values (p_season, v_user, p_date, v_steps, v_me, now())
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

-- ───────────────────────── Remove lead-only features ─────────────────────────

drop function if exists public.decide_correction(uuid, boolean);
drop table if exists public.correction_requests;
drop table if exists public.unlocked_dates;

-- ───────────────────────── Public reading ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'seasons', 'teams', 'team_members', 'membership_history', 'step_entries', 'leave_records',
    'fixtures', 'weekly_challenges', 'badge_definitions',
    'fixture_results', 'league_standings', 'weekly_awards', 'monthly_cups', 'user_badges'
  ] loop
    execute format('drop policy if exists "members read" on public.%I', t);
    execute format('create policy "anyone can read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('grant select on public.%I to anon', t);
  end loop;
end $$;

drop function if exists public.is_member();

-- Visitors (and anyone signed in) see names only; emails are for admins via member_contacts().
revoke select on public.profiles from anon, authenticated;
grant select (id, name, is_admin, active, created_at) on public.profiles to anon, authenticated;

revoke execute on function public.current_profile_id, public.member_contacts from public, anon;
grant execute on function public.current_profile_id, public.member_contacts to authenticated;
