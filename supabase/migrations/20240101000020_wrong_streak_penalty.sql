-- ============================================================
-- Waslha — Wrong-twice-in-a-row penalty
-- Rule (per user): if a player (solo) / team (teams) gets it WRONG
-- in a round AND wrong in the NEXT round, then when the game moves
-- to the round after that, deduct 10 points.
--   * solo  : a player is "wrong" if they submitted an incorrect
--             answer in that round (round_answers.is_correct=false).
--   * teams : a team is "wrong" if the round was won by the OTHER
--             team (result='correct' and winning_team = opponent).
--             Timeout rounds have no winner -> no one is penalized.
-- Scores are clamped at 0 (never go negative).
-- Runs exactly once per transition: it is invoked right after the
-- room state is validated and BEFORE create_round / game-end, from
-- both next_round and expire_round (the two advancing RPCs). The
-- idempotency guards on those RPCs make the penalty apply once.
-- Idempotent: safe to re-run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) The penalty helper (internal; not exposed to the Data API).
-- ------------------------------------------------------------------
create or replace function public.apply_wrong_streak_penalty(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_mode text;
  cur_round record;
  prev_round record;
  pl record;
  v_wrong_prev boolean;
  v_wrong_cur boolean;
begin
  select mode into v_mode from public.rooms where id = p_room_id;
  if v_mode is null then return; end if;

  -- The two most recently completed rounds (by round number).
  select * into cur_round from public.rounds
    where room_id = p_room_id
    order by round_number desc limit 1;
  select * into prev_round from public.rounds
    where room_id = p_room_id
    order by round_number desc limit 1 offset 1;
  if cur_round.id is null or prev_round.id is null then return; end if;

  if v_mode = 'solo' then
    for pl in select user_id from public.room_players
               where room_id = p_room_id
    loop
      v_wrong_prev := exists (
        select 1 from public.round_answers
         where round_id = prev_round.id and user_id = pl.user_id and is_correct = false
      );
      v_wrong_cur := exists (
        select 1 from public.round_answers
         where round_id = cur_round.id and user_id = pl.user_id and is_correct = false
      );
      if v_wrong_prev and v_wrong_cur then
        update public.room_players
           set score = greatest(score - 10, 0)
         where room_id = p_room_id and user_id = pl.user_id;
      end if;
    end loop;
  else
    -- Red team is "wrong" when BLUE won both rounds (and vice versa).
    if prev_round.result = 'correct' and prev_round.winning_team = 'blue'
       and cur_round.result = 'correct' and cur_round.winning_team = 'blue' then
      update public.rooms set red_score = greatest(red_score - 10, 0)
       where id = p_room_id;
    end if;
    if prev_round.result = 'correct' and prev_round.winning_team = 'red'
       and cur_round.result = 'correct' and cur_round.winning_team = 'red' then
      update public.rooms set blue_score = greatest(blue_score - 10, 0)
       where id = p_room_id;
    end if;
  end if;
end $$;

revoke execute on function public.apply_wrong_streak_penalty(uuid)
  from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 2) next_round — apply the penalty once the round is validated,
--    BEFORE the game-end / create_round branches, and re-read scores
--    so the final winner is computed AFTER any deduction.
-- ------------------------------------------------------------------
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

  -- NEW: deduct 10 for a wrong round followed by another wrong round.
  perform public.apply_wrong_streak_penalty(p_room_id);

  -- Re-read the scores AFTER the penalty so the winner is final.
  select coalesce(red_score, 0), coalesce(blue_score, 0) into red, blue
    from public.rooms where id = p_room_id;

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

-- ------------------------------------------------------------------
-- 3) expire_round — same penalty, applied after the timeout is
--    recorded and before the game-end / create_round branches.
-- ------------------------------------------------------------------
create or replace function public.expire_round(p_room_id uuid, p_round_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  room_rec record;
  round_rec record;
  rec record;
  red int;
  blue int;
  v_winner text;
  v_winner_name text;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');

  select status, round_id, current_round, red_score, blue_score into room_rec
    from public.rooms where id = p_room_id;
  perform public.assert_true(room_rec.status is not null, 'مفيش غرفة.');
  perform public.assert_true(room_rec.status = 'playing', 'اللعبة مش شغالة.');
  perform public.assert_true(room_rec.round_id = p_round_id, 'دي مش الجولة الحالية.');

  -- Serialize with submit_answer / next_round on the round row.
  select status as rstatus, ends_at into round_rec
    from public.rounds where id = p_round_id for update;
  perform public.assert_true(round_rec.rstatus is not null, 'مفيش جولة.');
  perform public.assert_true(round_rec.rstatus <> 'revealed', 'الجولة دي خلصت بالفعل.');
  perform public.assert_true(round_rec.ends_at is not null and round_rec.ends_at <= now(),
    'الوقت لسه شغال.');

  -- Timeout: no winner, no points.
  update public.rounds
     set status = 'revealed',
         result = 'timeout',
         score_delta = 0,
         answered_at = now()
   where id = p_round_id;

  -- NEW: deduct 10 for a wrong round followed by another wrong round.
  perform public.apply_wrong_streak_penalty(p_room_id);

  -- Re-read the scores AFTER the penalty so the winner is final.
  select coalesce(red_score, 0), coalesce(blue_score, 0) into red, blue
    from public.rooms where id = p_room_id;

  if room_rec.current_round >= 6 then
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
    return;
  end if;

  perform public.create_round(p_room_id, room_rec.current_round + 1);
  return query select true;
  return;
end $$;

grant execute on function public.expire_round to authenticated;