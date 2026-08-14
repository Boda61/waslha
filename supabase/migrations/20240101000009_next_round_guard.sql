-- Harden next_round: require that p_round_id is the CURRENT round.
-- Unlike expire_round, next_round never validated the round id, so a
-- double-click on "الجولة الجاية" (auto-countdown + manual button) could
-- advance/end the game prematurely or create a stray round.

create or replace function public.next_round(p_room_id uuid, p_round_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  r record;
  rec record;
  next_team text;
  red int;
  blue int;
  v_winner text;
  v_winner_name text;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  select id, host_id, status, current_round, current_turn_team, round_id,
         red_score, blue_score into r
  from public.rooms where id = p_room_id;
  perform public.assert_true(r.id is not null, 'مفيش غرفة.');
  perform public.assert_true(r.host_id = v_uid, 'انت مش صاحب الغرفة.');
  perform public.assert_true(r.status = 'playing', 'اللعبة مش شغالة.');
  perform public.assert_true(r.round_id = p_round_id, 'دي مش الجولة الحالية.');
  perform public.assert_true(r.current_turn_team is not null, 'لا جولة حالية.');

  if r.current_round >= 6 then
    red := coalesce(r.red_score, 0);
    blue := coalesce(r.blue_score, 0);
    if red > blue then
      v_winner := 'red';  v_winner_name := 'الفريق الأحمر';
    elsif blue > red then
      v_winner := 'blue'; v_winner_name := 'الفريق الأزرق';
    else
      v_winner := 'tie';  v_winner_name := 'تعادل';
    end if;

    update public.rooms
       set status='ended', winner=v_winner, winner_name=v_winner_name where id=p_room_id;

    for rec in select user_id, team, score from public.room_players where room_id=p_room_id
    loop
      update public.profiles p
         set games_played = games_played + 1,
             wins = wins + case when (v_winner <> 'tie' and rec.team = v_winner) then 1 else 0 end
       where p.id = rec.user_id;
    end loop;
    return query select true;
  end if;

  next_team := case when r.current_turn_team='red' then 'blue' else 'red' end;
  perform public.create_round(p_room_id, r.current_round + 1, next_team);
  return query select true;
end $$;

grant execute on function public.next_round to authenticated;