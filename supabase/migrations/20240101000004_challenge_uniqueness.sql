-- ============================================================
-- Waslha — No-duplicate challenge selection (server-side)
-- 1) pick_challenge(room) excludes every challenge already used
--    in a previous round of the SAME room.
-- 2) create_round locks the room row first so two concurrent
--    round creations can never pick the same challenge
--    (race-condition protection).
-- 3) rounds(room_id, challenge_id) index keeps the exclusion
--    lookup fast even with thousands of challenges.
-- Idempotent: safe to re-run.
-- ============================================================

-- Fast "has this challenge been used in this room?" lookup.
create index if not exists rounds_room_challenge_idx
  on public.rounds (room_id, challenge_id);

-- Guard: the SAME image pair (either orientation) can never be inserted
-- twice. Prevents accidental duplicate pairs when new challenges are added.
create unique index if not exists challenges_pair_uniq
  on public.challenges (least(image_a_emoji, image_b_emoji),
                        greatest(image_a_emoji, image_b_emoji));

-- pick_challenge now takes the room id and excludes used challenges.
-- The DB is the single source of truth for challenge selection.
create or replace function public.pick_challenge(p_room_id uuid)
returns table(id text, title text, image_a_emoji text, image_a_label text,
              image_b_emoji text, image_b_label text, choices jsonb,
              category text, difficulty text)
language sql security definer set search_path = public as
$$
  select c.id, c.title, c.image_a_emoji, c.image_a_label,
         c.image_b_emoji, c.image_b_label, c.choices, c.category, c.difficulty
  from public.challenges c
  where c.active
    and not exists (
      select 1 from public.rounds r
      where r.room_id = p_room_id and r.challenge_id = c.id
    )
  order by random()
  limit 1;
$$;

-- create_round: lock the room row (serializes round creation per room),
-- then pick an unused challenge. Errors clearly if challenges run out
-- instead of silently repeating.
create or replace function public.create_round(p_room_id uuid, p_round_number int, p_team text)
returns uuid language plpgsql security definer set search_path = public as
$$
declare
  v_round_id uuid;
  leader_uid uuid;
  v_available int;
begin
  -- Serialize round creation for this room: any concurrent call blocks
  -- here until the current transaction commits, so the exclusion query
  -- below always sees the latest committed rounds.
  perform 1 from public.rooms where id = p_room_id for update;

  select user_id into leader_uid from public.room_players
   where room_id = p_room_id and team = p_team and is_leader limit 1;
  if leader_uid is null then
    select user_id into leader_uid from public.room_players
     where room_id = p_room_id and team = p_team limit 1;
    perform public.assert_true(leader_uid is not null, 'الفريق ده مفيش فيه لاعيبة.');
  end if;

  -- Safe fallback: if every challenge is already used in this room,
  -- fail loudly instead of repeating one silently.
  select count(*) into v_available
    from public.challenges c
   where c.active
     and not exists (
       select 1 from public.rounds r
        where r.room_id = p_room_id and r.challenge_id = c.id
     );
  perform public.assert_true(v_available > 0,
    'خلصت كل التحديات المتاحة في الغرفة دي — ابدأ لعبة جديدة.');

  v_round_id := gen_random_uuid();
  insert into public.rounds (id, room_id, round_number, active_team, leader_id,
                             challenge_id, status, score_delta, started_at, ends_at)
  select v_round_id, p_room_id, p_round_number, p_team, leader_uid,
         pc.id, 'leader', 0, now(), now() + interval '90 seconds'
    from public.pick_challenge(p_room_id) pc;

  perform public.assert_true(found, 'مفيش تحديات جاهزة لسه.');

  update public.rooms
     set current_round = p_round_number,
         current_turn_team = p_team,
         round_id = v_round_id
   where id = p_room_id;

  return v_round_id;
end $$;