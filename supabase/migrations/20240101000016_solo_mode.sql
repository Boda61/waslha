-- ============================================================
-- Waslha — Solo mode (كل واحد لوحده)
-- New game mode beside the existing two-team race:
--   * rooms.mode = 'teams' (default, unchanged) | 'solo'
--   * solo: no teams at all. One neutral leader writes the hint;
--     every other player answers individually, and the FIRST
--     correct answer wins the round and takes the +100 points.
-- Idempotent, re-runnable, no data loss.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) rooms.mode
-- ------------------------------------------------------------------
alter table public.rooms
  add column if not exists mode text not null default 'teams'
  check (mode in ('teams','solo'));

-- ------------------------------------------------------------------
-- 2) round_answers.team -> nullable (solo players have no team).
--    The (round_id, team, choice_index) unique index still works:
--    Postgres unique indexes treat NULLs as distinct, so solo players
--    may each pick the same choice. The PK (round_id, user_id) still
--    guarantees one answer per player per round.
-- ------------------------------------------------------------------
alter table public.round_answers drop constraint if exists round_answers_team_check;
alter table public.round_answers alter column team drop not null;

-- ------------------------------------------------------------------
-- 3) create_room(p_team, p_mode) — store the chosen mode.
--    Drop the old single-arg overload first so the (text, text)
--    version with defaults becomes the one true create_room.
-- ------------------------------------------------------------------
drop function if exists public.create_room(text);
create or replace function public.create_room(p_team text default 'red', p_mode text default 'teams')
returns table(room_id uuid, code text) language plpgsql security definer set search_path = public as
$$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_team   text := coalesce(p_team, 'red');
  v_mode   text := coalesce(p_mode, 'teams');
  v_room   uuid := gen_random_uuid();
  v_code   text;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  prof     record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(v_mode in ('teams','solo'), 'وضع لعب غير صحيح.');
  if v_team not in ('red', 'blue') then v_team := 'red'; end if;

  select id, username, avatar into prof from public.profiles where id = v_uid;
  perform public.assert_true(prof.id is not null, 'سجّل البروفايل الأول.');

  for i in 1..10 loop
    v_code := '';
    for _ in 1..5 loop
      v_code := v_code || substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1);
    end loop;
    begin
      insert into public.rooms (id, code, host_id, leader_id, status, max_players,
                                current_round, current_turn_team, round_id,
                                red_score, blue_score, winner, winner_name, mode)
      values (v_room, v_code, v_uid, v_uid, 'lobby', 8, 0, null, null, 0, 0, null, null, v_mode);
      exit;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  perform public.assert_true(v_code is not null, 'مقدرناش نعمل كود دلوقتي، جرب تاني.');

  -- The room creator is the ONE neutral leader (team = NULL).
  insert into public.room_players (room_id, user_id, username, avatar, team,
                                   is_leader, is_ready, online, score)
  values (v_room, v_uid, prof.username, prof.avatar, null, true, false, true, 0);

  return query select v_room, v_code;
end $$;

-- ------------------------------------------------------------------
-- 4) join_room — in solo mode every joiner is neutral (team = NULL).
-- ------------------------------------------------------------------
create or replace function public.join_room(p_code text)
returns table(room_id uuid) language plpgsql security definer set search_path = public as
$$
#variable_conflict use_column
declare
  v_uid     uuid := auth.uid();
  code_norm text := upper(trim(coalesce(p_code, '')));
  room      public.rooms%rowtype;
  prof      record;
  team      text;
  counts    record;
  total     int;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(length(code_norm) >= 4, 'الكود مش صحيح.');

  select * into room from public.rooms where code = code_norm;
  perform public.assert_true(room.id is not null, 'مفيش غرفة بالكود ده.');
  perform public.assert_true(room.status = 'lobby', 'الغرفة دي بدأت أو خلصت — متقدرش تدخل دلوقتي.');

  select id, username, avatar into prof from public.profiles where id = v_uid;
  perform public.assert_true(prof.id is not null, 'سجّل البروفايل الأول.');

  if exists (select 1 from public.room_players where room_id = room.id and user_id = v_uid) then
    return query select room.id;
    return;
  end if;

  select count(*) into total from public.room_players where room_id = room.id;
  perform public.assert_true(total < room.max_players, 'الغرفة مليانة.');

  -- solo mode: no teams — every joiner is neutral.
  if room.mode = 'solo' then
    insert into public.room_players (room_id, user_id, username, avatar, team,
                                     is_leader, is_ready, online, score)
    values (room.id, v_uid, prof.username, prof.avatar, null, false, false, true, 0);
    return query select room.id;
    return;
  end if;

  select count(*) filter (where team='red') as red,
         count(*) filter (where team='blue') as blue
    into counts from public.room_players where room_id = room.id;

  team := case when counts.red <= counts.blue then 'red' else 'blue' end;

  insert into public.room_players (room_id, user_id, username, avatar, team,
                                   is_leader, is_ready, online, score)
  values (room.id, v_uid, prof.username, prof.avatar, team, false, false, true, 0);

  return query select room.id;
end $$;

-- ------------------------------------------------------------------
-- 5) set_team — blocked in solo mode (there are no teams).
-- ------------------------------------------------------------------
create or replace function public.set_team(p_room_id uuid, p_team text)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  v_team text := coalesce(p_team, 'red');
  me     record;
  room   record;
  cur_round record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(v_team in ('red','blue'), 'فريق غير صحيح.');

  select id, mode, status, round_id, leader_id into room from public.rooms where id = p_room_id;
  perform public.assert_true(room.id is not null, 'مفيش غرفة.');
  perform public.assert_true(room.mode <> 'solo', 'المود ده مفيش فيه فرق — الكل بيلعب لوحده.');

  select * into me from public.room_players where room_id = p_room_id and user_id = v_uid;
  perform public.assert_true(me.user_id is not null, 'أنت مش في الغرفة.');
  if me.team = v_team then return query select true; return; end if;

  perform public.assert_true(room.leader_id <> v_uid,
    'القائد بره الفريقين — سلم القيادة الأول لو عايز تلعب.');

  -- Team changes are allowed in the lobby and between rounds, but NOT while
  -- an answer race is live.
  if room.status = 'playing' then
    select status into cur_round from public.rounds where id = room.round_id;
    perform public.assert_true(cur_round.status is null or cur_round.status <> 'clue_submitted',
      'مفيش تغيير فريق أثناء سباق الإجابة.');
  end if;

  update public.room_players
     set team = v_team, is_ready = false
   where room_id = p_room_id and user_id = v_uid;

  update public.room_players set is_leader = (user_id = room.leader_id)
   where room_id = p_room_id;

  return query select true;
end $$;

-- ------------------------------------------------------------------
-- 6) change_leader — in solo mode nobody plays on a team, so the old
--    leader stays neutral instead of re-joining a team.
-- ------------------------------------------------------------------
create or replace function public.change_leader(p_room_id uuid, p_target_user_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  room_rec record;
  cur_round record;
  old_team text;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(p_target_user_id is not null, 'اختر اللاعب الجديد.');

  select leader_id, mode into room_rec from public.rooms where id = p_room_id;
  perform public.assert_true(room_rec.leader_id is not null, 'مفيش غرفة.');
  perform public.assert_true(room_rec.leader_id = v_uid, 'انت مش القائد الحالي.');
  perform public.assert_true(
    exists (select 1 from public.room_players
             where room_id = p_room_id and user_id = p_target_user_id),
    'اللاعب ده مش في الغرفة.');

  -- A leadership hand-off is not allowed while an answer race is live.
  select rnd.status into cur_round
    from public.rounds rnd
    join public.rooms rm on rm.round_id = rnd.id
   where rm.id = p_room_id;
  perform public.assert_true(
    cur_round.status is null or cur_round.status <> 'clue_submitted',
    'مفيش تغيير قائد أثناء سباق الإجابة.');

  -- New leader leaves their team and becomes the neutral clue-giver.
  update public.room_players
     set is_leader = true, team = null, is_ready = false
   where room_id = p_room_id and user_id = p_target_user_id;

  if room_rec.mode = 'solo' then
    -- solo: the old leader stays neutral too.
    update public.room_players
       set is_leader = false, is_ready = false
     where room_id = p_room_id and user_id = v_uid;
  else
    -- teams: old leader returns to the least-populated team so they can play.
    select case
             when (select count(*) from public.room_players
                    where room_id = p_room_id and team = 'red')
                  <= (select count(*) from public.room_players
                       where room_id = p_room_id and team = 'blue')
             then 'red' else 'blue' end
      into old_team;

    update public.room_players
       set is_leader = false, team = old_team, is_ready = false
     where room_id = p_room_id and user_id = v_uid;
  end if;

  update public.rooms set leader_id = p_target_user_id where id = p_room_id;

  -- If a clue phase is in progress, the new leader takes over the hint.
  update public.rounds set leader_id = p_target_user_id
   where id in (select round_id from public.rooms where id = p_room_id)
     and status = 'leader';

  return query select true;
end $$;

-- ------------------------------------------------------------------
-- 7) start_game — mode-aware minimum requirements.
--    teams: ≥3 players, both teams need a non-leader (unchanged).
--    solo : leader + at least one player who can answer.
-- ------------------------------------------------------------------
create or replace function public.start_game(p_room_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  r     record;
  np    int;
  ready int;
  non_leader int;
  has_red boolean := false;
  has_blue boolean := false;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  select id, host_id, leader_id, status, mode into r from public.rooms where id = p_room_id;
  perform public.assert_true(r.id is not null, 'مفيش غرفة.');
  perform public.assert_true(r.host_id = v_uid or r.leader_id = v_uid,
    'انت مش صاحب الغرفة أو القائد.');
  perform public.assert_true(r.status = 'lobby', 'اللعبة بدأت بالفعل.');

  select count(*) into np from public.room_players where room_id = p_room_id;
  select count(*) filter (where is_ready) into ready
    from public.room_players where room_id = p_room_id;
  perform public.assert_true(ready = np, 'مش كل اللاعيبة جاهزين.');

  if r.mode = 'solo' then
    select count(*) into non_leader from public.room_players
     where room_id = p_room_id and user_id <> r.leader_id;
    perform public.assert_true(np >= 2 and non_leader >= 1,
      'لازم قائد + لاعب واحد على الأقل عشان نبدأ.');
  else
    perform public.assert_true(np >= 3, 'لازم 3 لاعب على الأقل.');
    select true into has_red from public.room_players
     where room_id = p_room_id and team='red' and user_id <> r.leader_id limit 1;
    select true into has_blue from public.room_players
     where room_id = p_room_id and team='blue' and user_id <> r.leader_id limit 1;
    perform public.assert_true(has_red and has_blue,
      'لازم في لاعب واحد على الأقل في كل فريق يقدر يجاوب (مش القائد).');
  end if;

  perform public.seed_challenges();
  update public.rooms set status='playing', red_score=0, blue_score=0,
                        winner=null, winner_name=null where id = p_room_id;
  perform public.create_round(p_room_id, 1);
  return query select true;
end $$;

-- ------------------------------------------------------------------
-- 8) submit_answer — mode-aware.
--    teams: first correct TEAM wins (+100 to the team & the player).
--    solo : first correct PLAYER wins (+100 to that player only).
--    Wrong answers never end the round in either mode.
-- ------------------------------------------------------------------
create or replace function public.submit_answer(p_room_id uuid, p_round_id uuid, p_choice_index int)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  room_rec record;
  round_rec record;
  player_rec record;
  v_secret int;
  v_choices jsonb;
  v_choice_text text;
  v_correct boolean;
  v_score_delta int := 0;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(p_choice_index is not null and p_choice_index between 0 and 3,
    'اختيار غير صحيح.');

  select status, round_id, leader_id, mode into room_rec
    from public.rooms where id = p_room_id;
  perform public.assert_true(room_rec.status is not null, 'مفيش غرفة.');
  perform public.assert_true(room_rec.status = 'playing', 'اللعبة مش شغالة.');
  perform public.assert_true(room_rec.round_id = p_round_id, 'دي مش الجولة الحالية.');

  -- Race-condition protection: every answer serializes on the round row.
  select status as rstatus, leader_id, challenge_id, ends_at
    into round_rec
    from public.rounds where id = p_round_id for update;
  perform public.assert_true(round_rec.rstatus is not null, 'مفيش جولة.');
  perform public.assert_true(round_rec.rstatus = 'clue_submitted', 'السباق ده انتهى.');
  perform public.assert_true(round_rec.ends_at is not null and round_rec.ends_at > now(),
    'خلص وقت الجولة.');

  select user_id, team into player_rec
    from public.room_players where room_id = p_room_id and user_id = v_uid;
  perform public.assert_true(player_rec.user_id is not null, 'أنت مش في الغرفة.');
  if room_rec.mode = 'solo' then
    perform public.assert_true(player_rec.team is null,
      'المود ده مفيش فيه فرق — اللاعب اللي له تيم مش مفروض يكون موجود.');
  else
    perform public.assert_true(player_rec.team in ('red','blue'), 'لازم تختار فريق الأول.');
  end if;
  perform public.assert_true(
    v_uid <> room_rec.leader_id and v_uid <> round_rec.leader_id,
    'انت القائد — القائد مش بيجاوب.');
  perform public.assert_true(
    not exists (select 1 from public.round_answers
                 where round_id = p_round_id and user_id = v_uid),
    'انت جاوبت قبل كده.');

  select correct_index into v_secret
    from public.challenge_secrets where challenge_id = round_rec.challenge_id;
  perform public.assert_true(v_secret is not null, 'الإجابة السرية مش موجودة — اتصل بالأدمن.');
  select choices into v_choices from public.challenges where id = round_rec.challenge_id;
  v_choice_text := v_choices ->> p_choice_index;
  v_correct := (p_choice_index = v_secret);

  -- Record the attempt. The (round_id, user_id) PK stops repeats; in teams
  -- mode the (round_id, team, choice_index) unique index stops a team from
  -- repeating an already-tried choice. In solo mode team is NULL, so the
  -- unique index treats every row as distinct — each player answers once.
  begin
    insert into public.round_answers (round_id, user_id, team, choice_index, is_correct)
    values (p_round_id, v_uid, player_rec.team, p_choice_index, v_correct);
  exception when unique_violation then
    if exists (select 1 from public.round_answers
                where round_id = p_round_id and user_id = v_uid) then
      raise exception 'انت جاوبت قبل كده.' using ERRCODE := 'P0001';
    end if;
    raise exception 'الإجابة دي اتجربت قبل كده في فريقك — جربوا اختيار تاني.'
      using ERRCODE := 'P0001';
  end;

  if v_correct then
    v_score_delta := 100;
    update public.rounds
       set status = 'revealed',
           winning_team = case when room_rec.mode = 'solo' then null else player_rec.team end,
           winning_user_id = v_uid,
           selected_choice_index = p_choice_index,
           selected_answer = v_choice_text,
           submitted_by = v_uid,
           correct_index = v_secret,
           correct_answer = v_choices ->> v_secret,
           result = 'correct',
           score_delta = v_score_delta,
           answered_at = now()
     where id = p_round_id;

    -- teams: add the points to the winning team's score too.
    if room_rec.mode <> 'solo' then
      if player_rec.team = 'red' then
        update public.rooms set red_score = red_score + v_score_delta where id = p_room_id;
      else
        update public.rooms set blue_score = blue_score + v_score_delta where id = p_room_id;
      end if;
    end if;

    update public.room_players set score = score + v_score_delta, online = true
     where room_id = p_room_id and user_id = v_uid;
  end if;

  return jsonb_build_object(
    'correct',        v_correct,
    'round_revealed', v_correct,
    'winning_team',   case when v_correct and room_rec.mode <> 'solo' then player_rec.team else null end,
    'winning_user_id', case when v_correct then v_uid else null end,
    'correct_index',  case when v_correct then v_secret else null end,
    'score_delta',    v_score_delta
  );
end $$;

-- ------------------------------------------------------------------
-- 9) next_round — mode-aware end-of-game.
--    teams: compare team scores -> winner red/blue/tie.
--    solo : the highest-scoring non-leader player wins.
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
  perform public.assert_true(r.status = 'playing', 'اللعبة مش شغالة.');
  perform public.assert_true(r.round_id = p_round_id, 'دي مش الجولة الحالية.');

  -- Serialize with submit_answer / expire_round on the same round row.
  perform 1 from public.rounds where id = p_round_id for update;

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

-- ------------------------------------------------------------------
-- 10) expire_round — same mode-aware end-of-game (timeout = no winner).
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
  v_solo_winner uuid;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');

  select status, round_id, current_round, red_score, blue_score, leader_id, mode
    into room_rec
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

  if room_rec.current_round >= 6 then
    if room_rec.mode = 'solo' then
      select user_id into v_solo_winner from public.room_players
       where room_id = p_room_id and user_id <> room_rec.leader_id
       order by score desc, joined_at asc
       limit 1;
      select username into v_winner_name from public.room_players
       where room_id = p_room_id and user_id = v_solo_winner;
      v_winner := null;
    else
      red := coalesce(room_rec.red_score, 0);
      blue := coalesce(room_rec.blue_score, 0);
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

  perform public.create_round(p_room_id, room_rec.current_round + 1);
  return query select true;
  return;
end $$;

-- ------------------------------------------------------------------
-- 11) Grants — keep all RPCs available to authenticated.
-- ------------------------------------------------------------------
grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room to authenticated;
grant execute on function public.set_team to authenticated;
grant execute on function public.change_leader to authenticated;
grant execute on function public.start_game to authenticated;
grant execute on function public.submit_answer to authenticated;
grant execute on function public.next_round to authenticated;
grant execute on function public.expire_round to authenticated;
grant execute on function public.leave_room to authenticated;
