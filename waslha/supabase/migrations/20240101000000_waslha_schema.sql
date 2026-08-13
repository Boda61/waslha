-- ============================================================
-- Waslha — Supabase migration (Firebase -> Supabase)
-- Part 1: Schema, indexes, triggers
-- Idempotent: safe to run multiple times.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar text not null default '🦁',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  games_played int not null default 0,
  wins int not null default 0
);

create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

-- ---------- rooms ----------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  host_id uuid references auth.users(id) on delete set null,
  status text not null default 'lobby' check (status in ('lobby','playing','ended')),
  max_players int not null default 8,
  current_round int not null default 0,
  current_turn_team text check (current_turn_team in ('red','blue')),
  round_id uuid,
  red_score int not null default 0,
  blue_score int not null default 0,
  winner text check (winner in ('red','blue','tie')),
  winner_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rooms_code_idx on public.rooms (code);
create index if not exists rooms_host_idx on public.rooms (host_id);

-- ---------- room_players ----------
create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  avatar text not null default '🦁',
  team text check (team in ('red','blue')),
  is_leader boolean not null default false,
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  online boolean not null default false,
  score int not null default 0,
  primary key (room_id, user_id)
);

create index if not exists room_players_user_idx on public.room_players (user_id);
create index if not exists room_players_team_idx on public.room_players (room_id, team);

-- ---------- challenges ----------
create table if not exists public.challenges (
  id text primary key,
  title text not null,
  image_a_emoji text not null,
  image_a_label text not null,
  image_b_emoji text not null,
  image_b_label text not null,
  choices jsonb not null,
  category text not null default 'عام',
  difficulty text not null default 'سهل',
  active boolean not null default true
);

-- ---------- challenge_secrets (NEVER readable by clients) ----------
create table if not exists public.challenge_secrets (
  challenge_id text primary key references public.challenges(id) on delete cascade,
  correct_index int not null check (correct_index between 0 and 3)
);

-- ---------- rounds ----------
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number int not null,
  active_team text not null check (active_team in ('red','blue')),
  leader_id uuid references auth.users(id),
  challenge_id text references public.challenges(id),
  clue text,
  status text not null default 'leader' check (status in ('leader','clue_submitted','revealed')),
  selected_choice_index int check (selected_choice_index between 0 and 3),
  selected_answer text,
  submitted_by uuid references auth.users(id),
  correct_index int,     -- NULL until revealed by the RPC
  correct_answer text,   -- NULL until revealed by the RPC
  result text check (result in ('correct','incorrect')),
  score_delta int not null default 0,
  started_at timestamptz not null default now(),
  clue_submitted_at timestamptz,
  answered_at timestamptz,
  constraint rounds_room_unique unique (room_id, round_number)
);

create index if not exists rounds_room_idx on public.rounds (room_id);

-- ---------- messages ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  sender_id uuid references auth.users(id),
  sender_name text not null,
  avatar text not null default '🦁',
  team text check (team in ('red','blue')),
  text text not null check (char_length(text) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists messages_round_idx on public.messages (round_id, created_at);

-- ---------- predictions ----------
create table if not exists public.predictions (
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  choice_index int not null check (choice_index between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

create index if not exists predictions_round_idx on public.predictions (round_id);

-- ---------- updated_at triggers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_rooms on public.rooms;
create trigger set_updated_at_rooms before update on public.rooms
  for each row execute function public.set_updated_at();

-- ---------- auto-create profile on signup ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  username_val text;
  avatar_val text;
  display_name text;
begin
  display_name := new.raw_user_meta_data->>'username';
  if display_name is null or trim(display_name) = '' then
    username_val := 'لاعب' || floor(random()*9000+1000)::int;
  else
    username_val := trim(display_name);
  end if;
  avatar_val := coalesce(nullif(new.raw_user_meta_data->>'avatar',''), '🦁');
    insert into public.profiles (id, username, avatar, email)
  values (new.id, username_val, avatar_val, new.email)
  on conflict (id) do nothing;
  return new;
exception when unique_violation then
  username_val := 'لاعب' || floor(random()*9000+1000)::int;
  insert into public.profiles (id, username, avatar, email)
  values (new.id, username_val, avatar_val, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

