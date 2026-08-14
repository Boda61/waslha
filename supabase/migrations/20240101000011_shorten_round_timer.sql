-- Shorten the authoritative per-round timer from 90s to 30s.
-- create_round sets the `ends_at` deadline; the client only displays it.

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
         pc.id, 'leader', 0, now(), now() + interval '30 seconds'
    from public.pick_challenge(p_room_id) pc;

  perform public.assert_true(found, 'مفيش تحديات جاهزة لسه.');

  update public.rooms
     set current_round = p_round_number,
         current_turn_team = p_team,
         round_id = v_round_id
   where id = p_room_id;

  return v_round_id;
end $$;

grant execute on function public.create_round to authenticated;