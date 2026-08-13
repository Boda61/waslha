-- ============================================================
-- Waslha — Authoritative round timer
-- Adds a persisted `ends_at` deadline to `rounds` so every
-- client derives the remaining time from server state.
-- Refreshing must never restart the timer; the backend is the
-- only source of truth for round expiration.
-- ============================================================

-- 1) Add deadline column to rounds (idempotent).
alter table public.rounds
  add column if not exists ends_at timestamptz;

-- Index for any future timers/queries on active rounds.
create index if not exists rounds_ends_at_idx on public.rounds (ends_at);

-- 2) create_round: persist the deadline when the round starts.
--    The answer phase lasts `answerSeconds` (90s by default in constants.js).
create or replace function public.create_round(p_room_id uuid, p_round_number int, p_team text)
returns uuid language plpgsql security definer set search_path = public as
$$
declare
  v_round_id uuid;
  leader_uid uuid;
  chal public.challenges%rowtype;
begin
  select user_id into leader_uid from public.room_players
   where room_id = p_room_id and team = p_team and is_leader limit 1;
  if leader_uid is null then
    select user_id into leader_uid from public.room_players
     where room_id = p_room_id and team = p_team limit 1;
    perform public.assert_true(leader_uid is not null, 'الفريق ده مفيش فيه لاعيبة.');
  end if;

  select * into chal from public.challenges where active order by random() limit 1;
  perform public.assert_true(chal.id is not null, 'مفيش تحديات جاهزة لسه.');

  v_round_id := gen_random_uuid();
  insert into public.rounds (id, room_id, round_number, active_team, leader_id,
                             challenge_id, status, score_delta, started_at, ends_at)
  values (v_round_id, p_room_id, p_round_number, p_team, leader_uid, chal.id,
          'leader', 0, now(), now() + interval '90 seconds');

  update public.rooms
     set current_round = p_round_number,
         current_turn_team = p_team,
         round_id = v_round_id
   where id = p_room_id;

  return v_round_id;
end $$;

-- 3) submit_clue: the deadline must still be in the future while the leader
--    submits the clue, otherwise the round has expired (backend-authoritative).
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

  select room.status as status, room.round_id, round.status as rstatus, round.leader_id,
         round.ends_at
    into r
  from public.rooms room
  join public.rounds round on round.id = p_round_id and round.room_id = room.id
  where room.id = p_room_id;
  perform public.assert_true(r.rstatus is not null, 'مفيش جولة.');
    perform public.assert_true(r.status='playing', 'اللعبة مش شغالة.');
  perform public.assert_true(r.round_id = p_round_id, 'دي مش الجولة الحالية.');
  perform public.assert_true(r.rstatus='leader', 'التلميح اتسلم من قبل كده.');
  perform public.assert_true(r.leader_id = v_uid, 'انت مش قائد الجولة.');

  -- Authoritative expiration: clue must be submitted before the deadline.
  perform public.assert_true(r.ends_at is null or r.ends_at > now(), 'خلص وقت الجولة.');

  update public.rounds
     set clue = clue_text, status = 'clue_submitted', clue_submitted_at = now()
   where id = p_round_id;
  return query select true;
end $$;

-- 4) submit_answer: answers are only accepted before the deadline (and after
--    the clue is submitted). This is the backend enforcing the same deadline
--    every client is deriving from.
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
  pred_rec record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(p_choice_index is not null and p_choice_index between 0 and 3, 'اختيار غير صحيح.');

    select room.status, room.round_id, room.red_score, room.blue_score,
         r.status as rstatus, r.active_team, r.leader_id, r.challenge_id,
         r.selected_choice_index, r.ends_at
    into room_rec
  from public.rooms room
  join public.rounds r on r.id = p_round_id and r.room_id = room.id
  where room.id = p_room_id;

  perform public.assert_true(room_rec.rstatus is not null, 'مفيش جولة.');
  perform public.assert_true(room_rec.status='playing', 'اللعبة مش شغالة.');
  perform public.assert_true(room_rec.round_id = p_round_id, 'دي مش الجولة الحالية.');
  perform public.assert_true(room_rec.rstatus <> 'leader', 'القائد لسه مبعتش التلميح.');

  -- Authoritative expiration: answers only allowed before the deadline.
  perform public.assert_true(room_rec.ends_at is null or room_rec.ends_at > now(), 'خلص وقت الجولة.');

  select user_id, team, score into player_rec
   from public.room_players where room_id=p_room_id and user_id=v_uid;
  perform public.assert_true(player_rec.user_id is not null, 'أنت مش في الغرفة.');
  perform public.assert_true(player_rec.team = room_rec.active_team, 'الفريق التاني مش بيجاوب.');
  -- The leader/clue-giver is NEVER allowed to submit an answer, even when alone.
  perform public.assert_true(not (v_uid = room_rec.leader_id), 'انت القائد — متختارش نيابة عن الفريق.');
  -- prevent duplicate answer submission
    if room_rec.selected_choice_index is not null then
    perform public.assert_true(false, 'الإجابة اتسجلت قبل كده — ممنوع تكرر.');
  end if;

  -- read the protected correct answer (challenge_secrets is never readable by clients)
  select correct_index into v_secret from public.challenge_secrets where challenge_id = room_rec.challenge_id;
  perform public.assert_true(v_secret is not null, 'الإجابة السرية مش موجودة — اتصل بالأدمن.');
  select choices into v_choices from public.challenges where id = room_rec.challenge_id;
  v_choice_text := v_choices ->> p_choice_index;
  v_correct := (p_choice_index = v_secret);
  v_score_delta := case when v_correct then 100 else 0 end;

  update public.rounds
     set status='revealed', selected_choice_index=p_choice_index, selected_answer=v_choice_text,
         submitted_by=v_uid, correct_index=v_secret,
         correct_answer=v_choices ->> v_secret,
         result = case when v_correct then 'correct' else 'incorrect' end,
         score_delta=v_score_delta, answered_at=now()
   where id = p_round_id;

  if room_rec.active_team='red' then
    update public.rooms set red_score = red_score + v_score_delta where id=p_room_id;
  else
    update public.rooms set blue_score = blue_score + v_score_delta where id=p_room_id;
  end if;

  update public.room_players set score = score + v_score_delta, online=true
   where room_id=p_room_id and user_id=v_uid;

  -- reward correct predictions of the OPPOSITE team (20 points each)
  for pred_rec in
    select user_id, choice_index from public.predictions where round_id=p_round_id
  loop
    if pred_rec.choice_index = v_secret then
      update public.room_players set score = score + 20
       where room_id=p_room_id and user_id=pred_rec.user_id;
    end if;
  end loop;

  return jsonb_build_object('correct', v_correct, 'correct_index', v_secret, 'score_delta', v_score_delta);
end $$;

-- 5) submit_prediction: predictions also expire with the round.
create or replace function public.submit_prediction(p_room_id uuid, p_round_id uuid, p_choice_index int)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  v_r record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(p_choice_index is not null and p_choice_index between 0 and 3, 'اختيار غير صحيح.');

  select room.status, room.round_id, r.active_team, r.status as rstatus, r.ends_at
    into v_r
  from public.rooms room
  join public.rounds r on r.id = p_round_id and r.room_id = room.id
  where room.id = p_room_id;
  perform public.assert_true(v_r.rstatus is not null, 'مفيش جولة.');
  perform public.assert_true(v_r.status='playing', 'اللعبة مش شغالة.');
  perform public.assert_true(v_r.round_id = p_round_id, 'دي مش الجولة الحالية.');
  perform public.assert_true(v_r.rstatus='clue_submitted', 'التوقع متاح بس في وقت الإجابة.');

  -- Authoritative expiration.
  perform public.assert_true(v_r.ends_at is null or v_r.ends_at > now(), 'خلص وقت الجولة.');

  -- Only the OPPOSITE team can predict.
  perform public.assert_true(
    exists (select 1 from public.room_players
             where room_id=p_room_id and user_id=v_uid and team <> v_r.active_team),
    'الفريق اللي عليه الدور مش بيعمل توقعات.');

  perform public.assert_true(
    not exists (select 1 from public.predictions where round_id=p_round_id and user_id=v_uid),
    'لما تعمل توقع تقدرش تغيره خالص.');

  insert into public.predictions (round_id, user_id, choice_index)
  values (p_round_id, v_uid, p_choice_index)
  on conflict (round_id, user_id) do update set choice_index = p_choice_index;

  return query select true;
end $$;

-- 6) expire_round: authoritative server-side timer expiration.
--    Any room member may call it; it only succeeds when the persisted
--    deadline has actually passed, then it advances the game exactly
--    like next_round (switch team or end the game).
create or replace function public.expire_round(p_room_id uuid, p_round_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  r record;
  rec record;
  next_team text;
  red int;
  blue int;
  winner text;
  winner_name text;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');

  select room.status, room.round_id, room.current_round, room.current_turn_team,
         room.red_score, room.blue_score,
         round.status as rstatus, round.ends_at
    into r
  from public.rooms room
  join public.rounds round on round.id = p_round_id and round.room_id = room.id
  where room.id = p_room_id;

  perform public.assert_true(r.rstatus is not null, 'مفيش جولة.');
  perform public.assert_true(r.status = 'playing', 'اللعبة مش شغالة.');
  perform public.assert_true(r.round_id = p_round_id, 'دي مش الجولة الحالية.');
  perform public.assert_true(r.rstatus <> 'revealed', 'الجولة دي خلصت بالفعل.');
  -- Authoritative: only allow expiration when the persisted deadline passed.
  perform public.assert_true(r.ends_at is not null and r.ends_at <= now(), 'الوقت لسه شغال.');

  -- Mark the round as expired (no answer submitted = incorrect, 0 points).
  update public.rounds
     set status = 'revealed',
         result = 'incorrect',
         score_delta = 0,
         answered_at = now()
   where id = p_round_id;

  -- Advance the game exactly like next_round.
  if r.current_round >= 6 then
    red := coalesce(r.red_score, 0);
    blue := coalesce(r.blue_score, 0);
    if red > blue then
      winner := 'red';  winner_name := 'الفريق الأحمر';
    elsif blue > red then
      winner := 'blue'; winner_name := 'الفريق الأزرق';
    else
      winner := 'tie';  winner_name := 'تعادل';
    end if;

    update public.rooms
       set status='ended', winner=winner, winner_name=winner_name where id=p_room_id;

    for rec in select user_id, team, score from public.room_players where room_id=p_room_id
    loop
      update public.profiles p
         set games_played = games_played + 1,
             wins = wins + case when (winner <> 'tie' and rec.team = winner) then 1 else 0 end
       where p.id = rec.user_id;
    end loop;
    return query select true;
  end if;

  -- Start the next round with the other team.
  next_team := case when r.current_turn_team='red' then 'blue' else 'red' end;
  perform public.create_round(p_room_id, r.current_round + 1, next_team);
  return query select true;
end $$;

grant execute on function public.expire_round to authenticated;