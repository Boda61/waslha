-- ============================================================
-- Waslha — Publish missing tables for realtime
-- `profiles` was subscribed client-side (AuthContext) but never
-- added to the supabase_realtime publication, so games_played /
-- wins never refreshed live. `challenges` is also subscribed
-- (subscribeChallenge) for completeness.
-- Idempotent: safe to re-run.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;

  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='challenges') then
    alter publication supabase_realtime add table public.challenges;
  end if;
end $$;