-- ============================================================
-- Part 2: RLS + roles + helper policy function
-- ============================================================

-- `anon` and `authenticated` roles already exist in every Supabase project.
-- No role creation here — just grants.
grant usage on schema public to anon, authenticated;

-- Helper: is the caller a member of room <rid>?
create or replace function public.fn_is_room_member(rid uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.room_players where room_id = rid and user_id = auth.uid()); $$;

-- Helper: row-of helper used for team-aware leader checks is folded into policies inline.

-- Enable RLS on every user-facing table.
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.rounds enable row level security;
alter table public.messages enable row level security;
alter table public.predictions enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_secrets enable row level security;

-- challenge_secrets: DENY everything (only security-definer RPCs read it).
revoke all on public.challenge_secrets from anon, authenticated;

-- ---------- profiles policies ----------
create policy "profiles: self may select" on public.profiles for select using (auth.uid() = id);
create policy "profiles: self may update username/avatar" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------- rooms policies ----------
create policy "rooms: members may select" on public.rooms for select using (public.fn_is_room_member(id));

-- ---------- room_players policies ----------
create policy "room_players: members may select" on public.room_players for select using (public.fn_is_room_member(room_id));

-- ---------- rounds policies ----------
create policy "rounds: members may select" on public.rounds for select using (public.fn_is_room_member(room_id));

-- ---------- messages policies ----------
create policy "messages: members may select" on public.messages for select using (public.fn_is_room_member(room_id));
create policy "messages: active team may insert" on public.messages for insert
  with check (
    public.fn_is_room_member(room_id)
    and sender_id = auth.uid()
    and exists (
      select 1 from public.rounds r
      join public.room_players p on p.room_id = r.room_id
      where r.id = messages.round_id
        and r.room_id = messages.room_id
        and r.status = 'clue_submitted'
        and p.user_id = auth.uid()
        and p.team = r.active_team
    )
  );

-- ---------- predictions policies ----------
create policy "predictions: members may select" on public.predictions for select using (
  exists (select 1 from public.rounds r where r.id = predictions.round_id and public.fn_is_room_member(r.room_id))
);
create policy "predictions: opponents may insert once" on public.predictions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rounds r
      join public.room_players p on p.room_id = r.room_id
      where r.id = predictions.round_id
        and r.status = 'clue_submitted'
        and p.user_id = auth.uid()
        and p.team <> r.active_team
    )
    and not exists (
      select 1 from public.predictions pp
      where pp.round_id = predictions.round_id
        and pp.user_id = auth.uid()
    )
  );

-- ---------- challenges policies ----------
create policy "challenges: authenticated may read active" on public.challenges for select using (auth.role() = 'authenticated');

-- ---------- grants ----------
grant execute on function public.fn_is_room_member to authenticated;
grant execute on function public.handle_new_user to authenticated;
grant select on public.challenges to authenticated;
grant usage on schema public to anon, authenticated;

-- Realtime: publish changes so supabase-js realtime channel hears them (idempotent).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='room_players') then
    alter publication supabase_realtime add table public.room_players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='rounds') then
    alter publication supabase_realtime add table public.rounds;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='predictions') then
    alter publication supabase_realtime add table public.predictions;
  end if;
end $$;
