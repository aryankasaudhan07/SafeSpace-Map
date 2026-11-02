-- Run in Supabase: SQL Editor -> New query -> paste -> Run
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  category text not null,
  severity int not null check (severity between 1 and 5),
  title text not null,
  description text not null,
  time_of_day text not null check (time_of_day in ('morning', 'afternoon', 'evening', 'night')),
  -- salted hash of the reporter's device: blocks self-confirmation, never shown in the app
  reporter_hash text
);

-- Community verification: one vote per device per report ("confirm" = I've seen this too, "dispute" = not accurate)
create table if not exists public.report_votes (
  report_id text not null,
  voter_hash text not null,
  vote text not null check (vote in ('confirm', 'dispute')),
  created_at timestamptz not null default now(),
  primary key (report_id, voter_hash)
);

alter table public.reports enable row level security;
alter table public.report_votes enable row level security;

create policy "Anyone can read reports" on public.reports for select using (true);
create policy "Anyone can submit reports" on public.reports for insert with check (true);
create policy "Anyone can read votes" on public.report_votes for select using (true);
create policy "Anyone can vote" on public.report_votes for insert with check (true);
create policy "Voters can change their vote" on public.report_votes for update using (true);

-- Live location sharing: the id is the public link; only the sharer's phone holds the secret (stored hashed).
create table if not exists public.live_shares (
  id text primary key,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stopped_at timestamptz,
  last jsonb,
  trail jsonb not null default '[]'::jsonb
);

alter table public.live_shares enable row level security;

create policy "Server can read live shares" on public.live_shares for select using (true);
create policy "Server can start live shares" on public.live_shares for insert with check (true);
create policy "Server can update live shares" on public.live_shares for update using (true);
