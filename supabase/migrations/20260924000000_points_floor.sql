-- Daily team points now run 1-5 instead of 0-4.
--
-- Recording a day is worth a point on its own, so nobody who walked a little and reported
-- it honestly sees a zero next to their name. Every band keeps its step threshold and moves
-- up one point, which preserves the spacing between bands and every past result's shape.
--
-- Scores are derived, not stored, so the whole season rescores from the raw entries the
-- moment this lands. The materialised results tables refresh on the next admin save or the
-- next daily sheet sync.

update public.seasons s
set rules = jsonb_set(
  s.rules,
  '{bands}',
  (
    select jsonb_agg(jsonb_set(b, '{points}', to_jsonb((b ->> 'points')::int + 1)) order by (b ->> 'min')::int)
    from jsonb_array_elements(s.rules -> 'bands') b
  )
)
where jsonb_typeof(s.rules -> 'bands') = 'array'
  -- Only seasons still on a zero floor, so re-running this never inflates the scale twice.
  and (select min((b ->> 'points')::int) from jsonb_array_elements(s.rules -> 'bands') b) = 0;
