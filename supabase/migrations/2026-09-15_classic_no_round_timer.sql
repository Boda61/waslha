-- ============================================================
-- Waslha — Classic modes (teams / solo): no round timer
--
-- Mirrors the Hebd precedent ("hebd_anyone_guess_no_timer"):
--   * create_round (both overloads) writes NO deadline, so
--     rounds.ends_at stays NULL.
--   * submit_clue / submit_answer no longer check a deadline, so a
--     round can never lock itself while players are still playing.
--   * expire_round is kept untouched as legacy — the client no
--     longer calls it (same as expire_hebd_round).
--
-- A round now ends only when someone answers correctly, or when the
-- host / leader moves the game forward manually (next_round).
-- ============================================================

-- 1) Clear any deadline still stored on an in-flight round so a game
--    that is running while this deploys is not blocked afterwards.
update public.rounds
   set ends_at = null
 where ends_at is not null
   and status <> 'revealed';

-- 2) create_round(p_room_id, p_round_number) — no deadline is written.
create or replace function public.create_round(p_room_id uuid, p_round_number integer)
returns uuid language plpgsql security definer set search_path = public as
$$
declare
  v_round_id uuid;
  leader_uid uuid;
  v_available int;
begin
  perform 1 from public.rooms where id = p_room_id for update;

  select leader_id into leader_uid from public.rooms where id = p_room_id;
  perform public.assert_true(leader_uid is not null, 'مفيش قائد للغرفة — اختار قائد.');
  perform public.assert_true(
    exists (select 1 from public.room_players
             where room_id = p_room_id and user_id = leader_uid),
    'القائد مش في الغرفة — اختار قائد تاني.');

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
  -- No timer: ends_at stays NULL — the round runs until someone answers.
  insert into public.rounds (id, room_id, round_number, active_team, leader_id,
                             challenge_id, status, score_delta, started_at)
  select v_round_id, p_room_id, p_round_number, null, leader_uid,
         pc.id, 'leader', 0, now()
    from public.pick_challenge(p_room_id) pc;

  perform public.assert_true(found, 'مفيش تحديات جاهزة لسه.');

  update public.rooms
     set current_round = p_round_number,
         current_turn_team = null,
         round_id = v_round_id
   where id = p_room_id;

  return v_round_id;
end $$;

-- 3) create_round(p_room_id, p_round_number, p_team) — no deadline.
create or replace function public.create_round(p_room_id uuid, p_round_number integer, p_team text)
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
  -- No timer: ends_at stays NULL — the round runs until someone answers.
  insert into public.rounds (id, room_id, round_number, active_team, leader_id,
                             challenge_id, status, score_delta, started_at)
  select v_round_id, p_room_id, p_round_number, p_team, leader_uid,
         pc.id, 'leader', 0, now()
    from public.pick_challenge(p_room_id) pc;

  perform public.assert_true(found, 'مفيش تحديات جاهزة لسه.');

  update public.rooms
     set current_round = p_round_number,
         current_turn_team = p_team,
         round_id = v_round_id
   where id = p_room_id;

  return v_round_id;
end $$;

-- 4) submit_clue — no deadline check.
create or replace function public.submit_clue(p_room_id uuid, p_round_id uuid, p_clue text)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  clue_text text := trim(coalesce(p_clue, ''));
  r record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(length(clue_text) between 1 and 40, 'التلميح لازم يبقى بين 1 و 40 حرف.');

  select room.status as status, room.round_id, round.status as rstatus,
         round.leader_id
    into r
  from public.rooms room
  join public.rounds round on round.id = p_round_id and round.room_id = room.id
  where room.id = p_room_id;
  perform public.assert_true(r.rstatus is not null, 'مفيش جولة.');
  perform public.assert_true(r.status='playing', 'اللعبة مش شغالة.');
  perform public.assert_true(r.round_id = p_round_id, 'دي مش الجولة الحالية.');
  perform public.assert_true(r.rstatus='leader', 'التلميح اتسلم من قبل كده.');
  perform public.assert_true(r.leader_id = v_uid, 'انت مش قائد الجولة.');

  update public.rounds
     set clue = clue_text, status = 'clue_submitted', clue_submitted_at = now()
   where id = p_round_id;
  return query select true;
end $$;

-- 5) submit_answer — no deadline check (answers stay open until the round
--    is won, or the host / leader moves the game on).
create or replace function public.submit_answer(p_room_id uuid, p_round_id uuid, p_choice_index integer)
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

  select status as rstatus, leader_id, challenge_id
    into round_rec
    from public.rounds where id = p_round_id for update;
  perform public.assert_true(round_rec.rstatus is not null, 'مفيش جولة.');
  perform public.assert_true(round_rec.rstatus = 'clue_submitted', 'السباق ده انتهى.');

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
    -- Points come from the challenge's difficulty (سهل 50 / متوسط 75 / صعب 100).
    v_score_delta := public.difficulty_points(
      (select difficulty from public.challenges where id = round_rec.challenge_id)
    );
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

-- expire_round is intentionally left untouched: it is legacy now (the client
-- never calls it, exactly like expire_hebd_round) and it can never fire
-- anyway because rounds.ends_at is always NULL.
