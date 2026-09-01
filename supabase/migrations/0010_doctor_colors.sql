-- Each doctor gets a stable color from a fixed 5-slot palette (max 5
-- doctors, so colors are always unique). The API assigns the first unused
-- color on insert; the value is a palette key ("violet", "cyan", "lime",
-- "orange", "pink") — the frontend maps keys to styling. The backfill
-- below colors any pre-existing doctors in created_at order, skipping
-- colors already taken. Safe to re-run.

alter table public.doctors add column if not exists color text;

with free as (
  select p.color, row_number() over (order by p.ord) as rn
  from unnest(array['violet','cyan','lime','orange','pink'])
    with ordinality as p(color, ord)
  where p.color not in (
    select color from public.doctors where color is not null
  )
),
uncolored as (
  select id, row_number() over (order by created_at) as rn
  from public.doctors
  where color is null
)
update public.doctors d
set color = f.color
from uncolored u
join free f on f.rn = u.rn
where d.id = u.id;
