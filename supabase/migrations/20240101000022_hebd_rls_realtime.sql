-- ============================================================
-- Waslha — Hebd Mode — Part 2: RLS + Realtime
-- Locks down the 8 Hebd tables created by migration 21:
--   * RLS enabled on all 8 tables.
--   * SELECT policies:
--       - 5 game-state tables  -> room members (fn_is_room_member)
--       - hebd_categories/items -> any authenticated user (active)
--   * NO client INSERT/UPDATE/DELETE policies anywhere.
--   * hebd_item_secrets: ZERO client access (mirrors
--     challenge_secrets): no policies + revoke from anon/authenticated.
--   * Realtime: only hebd_matches / hebd_rounds / hebd_guesses /
--     hebd_card_uses / hebd_match_categories added to
--     supabase_realtime. NEVER hebd_item_secrets.
-- SCHEMA-ONLY SECURITY LAYER: no RPCs, no seed, no game logic.
-- No Classic policy / RPC / table is touched.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Enable RLS on all 8 Hebd tables
-- ------------------------------------------------------------
alter table public.hebd_categories enable row level security;
alter table public.hebd_items enable row level security;
alter table public.hebd_item_secrets enable row level security;
alter table public.hebd_match_categories enable row level security;
alter table public.hebd_matches enable row level security;
alter table public.hebd_rounds enable row level security;
alter table public.hebd_guesses enable row level security;
alter table public.hebd_card_uses enable row level security;

-- ------------------------------------------------------------
-- 2) Public content: authenticated may read ACTIVE rows only
--    (same philosophy as "challenges: authenticated may read active")
-- ------------------------------------------------------------
create policy "hebd_categories: authenticated may read active"
  on public.hebd_categories for select
  using (auth.role() = 'authenticated'::text and active = true);

create policy "hebd_items: authenticated may read active"
  on public.hebd_items for select
  using (auth.role() = 'authenticated'::text and active = true);

grant select on public.hebd_categories to authenticated;
grant select on public.hebd_items to authenticated;

-- ------------------------------------------------------------
-- 3) Game-state tables: SELECT for room members ONLY.
--    All writes stay RPC-only in Phase 3 (no INSERT/UPDATE/DELETE policies).
-- ------------------------------------------------------------
create policy "hebd_match_categories: members may select"
  on public.hebd_match_categories for select
  using (public.fn_is_room_member(room_id));

create policy "hebd_matches: members may select"
  on public.hebd_matches for select
  using (public.fn_is_room_member(room_id));

create policy "hebd_rounds: members may select"
  on public.hebd_rounds for select
  using (public.fn_is_room_member(room_id));

create policy "hebd_guesses: members may select"
  on public.hebd_guesses for select
  using (public.fn_is_room_member(room_id));

create policy "hebd_card_uses: members may select"
  on public.hebd_card_uses for select
  using (public.fn_is_room_member(room_id));

-- ------------------------------------------------------------
-- 4) CRITICAL: hebd_item_secrets — ZERO client access.
--    RLS is enabled, NO policies at all, and privileges are
--    revoked from anon/authenticated. This mirrors the exact
--    challenge_secrets model. Only SECURITY DEFINER RPCs
--    (Phase 3) may touch it via the function owner.
-- ------------------------------------------------------------
revoke all on public.hebd_item_secrets from anon, authenticated;

-- ------------------------------------------------------------
-- 5) Realtime: publish Hebd game-state tables (idempotent).
--    Classic tables already in supabase_realtime are untouched.
--    hebd_item_secrets is intentionally NOT added.
--    hebd_categories / hebd_items are static content — no realtime.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='hebd_matches') then
    alter publication supabase_realtime add table public.hebd_matches;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='hebd_rounds') then
    alter publication supabase_realtime add table public.hebd_rounds;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='hebd_guesses') then
    alter publication supabase_realtime add table public.hebd_guesses;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='hebd_card_uses') then
    alter publication supabase_realtime add table public.hebd_card_uses;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='hebd_match_categories') then
    alter publication supabase_realtime add table public.hebd_match_categories;
  end if;
end $$;