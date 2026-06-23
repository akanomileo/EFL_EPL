-- Supabase setup for EFL League Format Website
-- This creates a separate table from your UCL/tournament website.

create table if not exists public.efl_league_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table public.efl_league_data enable row level security;

drop policy if exists "Public read league data" on public.efl_league_data;
drop policy if exists "Public write league data" on public.efl_league_data;

create policy "Public read league data"
on public.efl_league_data
for select
using (true);

create policy "Public write league data"
on public.efl_league_data
for all
using (true)
with check (true);

insert into public.efl_league_data (key, value)
values
  ('settings', '{"tournamentName":"EFL League","teamLimit":48,"leagueSize":20,"fixtureFormat":"single","resultDeadlineDate":"","resultDeadlineTime":"","matchweekDeadlines":{},"adminPin":""}'::jsonb),
  ('teams', '[]'::jsonb),
  ('matches', '[]'::jsonb)
on conflict (key) do nothing;

-- Enable realtime for this table.
do $$
begin
  alter publication supabase_realtime add table public.efl_league_data;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
