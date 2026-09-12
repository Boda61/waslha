-- ============================================================
-- Waslha — Hebd Mode (1v1) — Part 1: Schema
-- New game mode beside the existing teams/solo classic modes.
--   * Reuses rooms / room_players / profiles as shared infra.
--   * Dedicated hebd_* tables hold Hebd match state.
--   * rooms.mode CHECK gains 'hebd' -> ('teams','solo','hebd').
-- This migration is SCHEMA ONLY:
--   * No RLS, no grants, no RPCs, no seed data.
--   * No realtime publication changes.
--   * No game logic / triggers (Phase 2+ handles those).
-- No Classic table is modified EXCEPT the rooms.mode CHECK
-- constraint (widened to accept 'hebd'). No data deletion.
-- ============================================================

-- ------------------------------------------------------------
-- 1) hebd_categories — catalog of Hebd categories
-- ------------------------------------------------------------
create table public.hebd_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  emoji text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true
);

-- ------------------------------------------------------------
-- 2) hebd_items — Hebd images/items per category
--    Public metadata only; the answer lives in hebd_item_secrets.
-- ------------------------------------------------------------
create table public.hebd_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.hebd_categories(id) on delete cascade,
  image_emoji text not null,
  image_url text,
  difficulty text not null default 'سهل' check (difficulty in ('سهل','متوسط','صعب')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists hebd_items_category_idx
  on public.hebd_items (category_id);

-- ------------------------------------------------------------
-- 3) hebd_item_secrets — SECRET answers
--    NEVER readable by clients; security handled in Phase 2.
-- ------------------------------------------------------------
create table public.hebd_item_secrets (
  item_id uuid primary key references public.hebd_items(id) on delete cascade,
  answer text not null
);

-- ------------------------------------------------------------
-- 4) hebd_match_categories — chosen category order per match
--    PK (room_id, position) preserves the selected order;
--    UNIQUE (room_id, category_id) prevents duplicates.
-- ------------------------------------------------------------
create table public.hebd_match_categories (
  room_id uuid not null references public.rooms(id) on delete cascade,
  category_id uuid not null references public.hebd_categories(id),
  position integer not null,
  primary key (room_id, position),
  unique (room_id, category_id)
);

create index if not exists hebd_match_categories_category_idx
  on public.hebd_match_categories (category_id);

-- ------------------------------------------------------------
-- 5) hebd_matches — match config + state (1:1 with rooms)
-- ------------------------------------------------------------
create table public.hebd_matches (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  total_rounds integer not null default 5 check (total_rounds between 1 and 10),
  current_round integer not null default 0,
  current_round_id uuid,
  status text not null default 'lobby' check (status in ('lobby','playing','ended')),
  winner_user_id uuid references auth.users(id),
  winner_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6) hebd_rounds — per-round state
--    answer is NULL until the reveal RPC writes it (Phase 3).
--    No triggers here that could auto-populate it.
-- ------------------------------------------------------------
create table public.hebd_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number integer not null,
  presenter_id uuid not null references auth.users(id),
  guesser_id uuid not null references auth.users(id),
  item_id uuid not null references public.hebd_items(id),
  status text not null default 'presenting' check (status in ('presenting','guessing','revealed')),
  answer text,
  green_hint text,
  guesser_won boolean,
  winner_user_id uuid references auth.users(id),
  score_delta integer not null default 0,
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  revealed_at timestamptz,
  unique (room_id, round_number)
);

create index if not exists hebd_rounds_room_idx on public.hebd_rounds (room_id);
create index if not exists hebd_rounds_item_idx on public.hebd_rounds (item_id);

-- ------------------------------------------------------------
-- 7) hebd_guesses — guess attempts
--    A guesser submits MULTIPLE guesses, so there is deliberately
--    NO unique (round_id, guesser_id) constraint.
-- ------------------------------------------------------------
create table public.hebd_guesses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid not null references public.hebd_rounds(id) on delete cascade,
  guesser_id uuid not null references auth.users(id),
  guess text not null check (char_length(guess) <= 100),
  normalized text not null,
  is_correct boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists hebd_guesses_round_idx on public.hebd_guesses (round_id);
create index if not exists hebd_guesses_round_created_idx on public.hebd_guesses (round_id, created_at);

-- ------------------------------------------------------------
-- 8) hebd_card_uses — card consumption
--    PK (room_id, user_id, card) is the hard guarantee: a player
--    can consume the red card and/or the green card at most once
--    per match. Second use = unique violation.
-- ------------------------------------------------------------
create table public.hebd_card_uses (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  card text not null check (card in ('red','green')),
  round_id uuid not null references public.hebd_rounds(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id, card)
);

-- ------------------------------------------------------------
-- 9) rooms.mode — widen CHECK to accept 'hebd'
--    BEFORE: CHECK (mode in ('teams','solo'))
--    AFTER : CHECK (mode in ('teams','solo','hebd'))
--    Only runs once: if the constraint already contains 'hebd'
--    (re-run / already migrated), this is a no-op.
--    Existing rows and columns are untouched.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'rooms_mode_check'
       and conrelid = 'public.rooms'::regclass
       and pg_get_constraintdef(oid) not like '%hebd%'
  ) then
    alter table public.rooms drop constraint rooms_mode_check;
    alter table public.rooms
      add constraint rooms_mode_check check (mode in ('teams','solo','hebd'));
  end if;
end $$;