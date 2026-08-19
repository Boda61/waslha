-- ============================================================
-- Waslha — next_round idempotency
-- 400 Bad Request on rpc/next_round: every client's round-result
-- countdown fired next_round (non-privileged -> "انت مش صاحب
-- الغرفة أو القائد"), and duplicate/stale calls fired again after
-- the round already advanced -> "دي مش الجولة الحالية".
--
-- Fix the backend side: next_round keeps all real checks (room
-- exists, caller is host or leader) but, after serializing on the
-- round row lock, re-reads the room and treats a duplicate/stale
-- call — the game already ended or the passed round is no longer
-- the room's current round — as a harmless no-op instead of raising.
-- That absorbs the host-vs-leader race and retried calls so the
-- game still advances cleanly (and never double-creates a round).
-- ============================================================

create or replace function public.next_round(p_room_id uuid, p_round_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  r record;
  rec record;
  red int;
  blue int;
  v_winner text;
  v_winner_name text;
  v_solo_winner uuid;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  select id, host_id, leader_id, status, current_round, round_id, red_score, blue_score, mode
    into r from public.rooms where id = p_room_id;
  perform public.assert_true(r.id is not null, 'مفيش غرفة.');
  perform public.assert_true(r.host_id = v_uid or r.leader_id = v_uid,
    'انت مش صاحب الغرفة أو القائد.');

  -- Serialize with submit_answer / expire_round on the same round row.
  perform 1 from public.rounds where id = p_round_id for update;

  -- Re-read the room AFTER acquiring the lock so racing "next round" calls
  -- (host vs leader, double-clicks, retries) see the winner's commit. If the
  -- game already ended, or this round is no longer the room's current round,
  -- someone already advanced — treat it as done instead of raising a 400.
  select id, host_id, leader_id, status, current_round, round_id, red_score, blue_score, mode
    into r from public.rooms where id = p_room_id;
  if r.status = 'ended' or r.round_id <> p_round_id then
    return query select true;
    return;
  end if;

  perform public.assert_true(r.status = 'playing', 'اللعبة مش شغالة.');

  if r.current_round >= 6 then
    if r.mode = 'solo' then
      select user_id into v_solo_winner from public.room_players
       where room_id = p_room_id and user_id <> r.leader_id
       order by score desc, joined_at asc
       limit 1;
      select username into v_winner_name from public.room_players
       where room_id = p_room_id and user_id = v_solo_winner;
      v_winner := null;
    else
      red := coalesce(r.red_score, 0);
      blue := coalesce(r.blue_score, 0);
      if red > blue then
        v_winner := 'red';  v_winner_name := 'الفريق الأحمر';
      elsif blue > red then
        v_winner := 'blue'; v_winner_name := 'الفريق الأزرق';
      else
        v_winner := 'tie';  v_winner_name := 'تعادل';
      end if;
    end if;

    update public.rooms
       set status='ended', winner=v_winner, winner_name=v_winner_name where id=p_room_id;

    for rec in select user_id, team, score from public.room_players where room_id=p_room_id
    loop
      update public.profiles p
         set games_played = games_played + 1,
             wins = wins + case when (v_winner is not null and v_winner <> 'tie' and rec.team = v_winner) then 1
                                when (v_winner is null and rec.user_id = v_solo_winner) then 1 else 0 end
       where p.id = rec.user_id;
    end loop;
    return query select true;
    return;
  end if;

  perform public.create_round(p_room_id, r.current_round + 1);
  return query select true;
  return;
end $$;

grant execute on function public.next_round to authenticated;