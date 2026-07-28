create table if not exists public.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique check (join_code ~ '^[A-Z]{3}-[0-9]{3}$'),
  game_type text not null,
  host_id text not null,
  host_name text not null check (char_length(host_name) between 1 and 16),
  guest_id text,
  guest_name text check (guest_name is null or char_length(guest_name) between 1 and 16),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.multiplayer_rooms enable row level security;

alter table public.multiplayer_rooms
  drop constraint if exists multiplayer_rooms_game_type_check;
alter table public.multiplayer_rooms
  add constraint multiplayer_rooms_game_type_check
  check (game_type in ('galgje', 'zeeslag', 'vieropeenrij', 'boterkaaseieren'));

drop policy if exists "rooms_can_be_read_by_code" on public.multiplayer_rooms;
create policy "rooms_can_be_read_by_code"
on public.multiplayer_rooms for select
to anon
using (created_at > now() - interval '24 hours');

drop policy if exists "rooms_can_be_created" on public.multiplayer_rooms;
create policy "rooms_can_be_created"
on public.multiplayer_rooms for insert
to anon
with check (
  created_at > now() - interval '5 minutes'
  and guest_id is null
  and status = 'waiting'
);

drop policy if exists "active_rooms_can_be_updated" on public.multiplayer_rooms;
create policy "active_rooms_can_be_updated"
on public.multiplayer_rooms for update
to anon
using (created_at > now() - interval '24 hours')
with check (created_at > now() - interval '24 hours');

do $$
begin
  alter publication supabase_realtime add table public.multiplayer_rooms;
exception
  when duplicate_object then null;
end $$;

create index if not exists multiplayer_rooms_join_code_idx
  on public.multiplayer_rooms (join_code);

create index if not exists multiplayer_rooms_created_at_idx
  on public.multiplayer_rooms (created_at);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 16),
  name_key text not null unique,
  pin_salt text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.player_progress (
  player_id uuid primary key references public.players(id) on delete cascade,
  progress jsonb not null default '{"stars":0,"completed":[],"gameWins":{},"levels":{},"runnerHighscores":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.player_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.players enable row level security;
alter table public.player_progress enable row level security;
alter table public.player_sessions enable row level security;

revoke all on public.players from anon, authenticated;
revoke all on public.player_progress from anon, authenticated;
revoke all on public.player_sessions from anon, authenticated;

create index if not exists player_sessions_token_hash_idx on public.player_sessions (token_hash);
create index if not exists player_sessions_expires_at_idx on public.player_sessions (expires_at);
