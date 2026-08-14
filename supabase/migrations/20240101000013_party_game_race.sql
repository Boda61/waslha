-- ============================================================
-- Waslha — Party Game Race model (single room leader + 2-team race)
-- Replaces the old "active team / team leader" gameplay with:
--   * ONE room-level leader (rooms.leader_id). The room creator is the
--     first leader; the leader can hand off leadership via change_leader.
--   * The leader sees the secret images and writes the hint (clue phase).
--   * After the hint, BOTH teams race to answer at the same time.
--   * The FIRST correct answer recorded in the DB wins the round
--     (race-condition safe via a round-row lock inside submit_answer).
--   * Wrong answers do not end the round; the teams keep trying.
--   * Timeout (expire_round) ends the round with NO winner.
-- Idempotent: safe to re-run.
-- No DROP TABLE / TRUNCATE / column deletion — production data is kept.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) rooms.leader_id — the single room leader
-- ------------------------------------------------------------------
alter table public.rooms
  add column if not exists leader_id uuid references auth.users(id);

-- Backfill existing rooms (the creator/host becomes the leader) — UPDATE only.
update public.rooms set leader_id = host_id
 where leader_id is null and host_id is not null;

-- Normalize room_players.is_leader to reflect the single room leader
-- (old per-team leaders collapse into one room leader). UPDATE only.
update public.room_players p
   set is_leader = (p.user_id = r.leader_id)
  from public.rooms r
 where r.id = p.room_id;

-- ------------------------------------------------------------------
-- 2) rounds — winning team / winner + race + timeout support
-- ------------------------------------------------------------------
alter table public.rounds
  add column if not exists winning_team text check (winning_team in ('red','blue'));

alter table public.rounds
  add column if not exists winning_user_id uuid references auth.users(id);

-- active_team is obsolete (both teams race together). Keep the column for
-- historical data but stop requiring it for new rounds.
alter table public.rounds alter column active_team drop not null;

-- Widen the result check so expire_round can record a timeout with no winner.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'rounds_result_check'
       and conrelid = 'public.rounds'::regclass
       and pg_get_constraintdef(oid) like '%timeout%'
  ) then
    alter table public.rounds drop constraint if exists rounds_result_check;
    alter table public.rounds
      add constraint rounds_result_check check (result in ('correct','incorrect','timeout'));
  end if;
end $$;

-- ------------------------------------------------------------------
-- 3) round_answers — per-round answer attempts (anti-spam + feedback)
--    PK (round_id, user_id)            -> one answer per player per round.
--    UNIQ (round_id, team, choice)     -> a team cannot repeat an answer.
-- ------------------------------------------------------------------
create table if not exists public.round_answers (
  round_id     uuid not null references public.rounds(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  team         text not null check (team in ('red','blue')),
  choice_index int  not null check (choice_index between 0 and 3),
  is_correct   boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (round_id, user_id)
);

create unique index if not exists round_answers_team_choice_uniq
  on public.round_answers (round_id, team, choice_index);

create index if not exists round_answers_round_idx
  on public.round_answers (round_id);

-- Only the RPCs (security definer) may write; members may read the attempts
-- of their room so the UI can confirm answers from the DB (not optimistic UI).
alter table public.round_answers enable row level security;

drop policy if exists "round_answers: members may select" on public.round_answers;
create policy "round_answers: members may select"
  on public.round_answers for select using (
    exists (
      select 1 from public.rounds r
       where r.id = round_answers.round_id
         and public.fn_is_room_member(r.room_id)
    )
  );

grant select on public.round_answers to authenticated, anon;
-- no INSERT/UPDATE/DELETE grants -> direct client writes are impossible.

-- Publish for realtime (idempotent).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and tablename='round_answers') then
    alter publication supabase_realtime add table public.round_answers;
  end if;
end $$;

-- ------------------------------------------------------------------
-- 4) create_round — now takes ONLY (room_id, round_number).
--    The clue-giver is always the single room leader.
--    Internal helper: NOT callable by anon/authenticated.
-- ------------------------------------------------------------------
create or replace function public.create_round(p_room_id uuid, p_round_number int)
returns uuid language plpgsql security definer set search_path = public as
$$
declare
  v_round_id uuid;
  leader_uid uuid;
  v_available int;
begin
  -- Serialize round creation for this room (race protection).
  perform 1 from public.rooms where id = p_room_id for update;

  select leader_id into leader_uid from public.rooms where id = p_room_id;
  perform public.assert_true(leader_uid is not null, 'مفيش قائد للغرفة — اختار قائد.');
  perform public.assert_true(
    exists (select 1 from public.room_players
             where room_id = p_room_id and user_id = leader_uid),
    'القائد مش في الغرفة — اختار قائد تاني.');

  -- Safe fallback: if every challenge is already used, fail loudly.
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
  select v_round_id, p_room_id, p_round_number, null, leader_uid,
         pc.id, 'leader', 0, now(), now() + interval '30 seconds'
    from public.pick_challenge(p_room_id) pc;

  perform public.assert_true(found, 'مفيش تحديات جاهزة لسه.');

  update public.rooms
     set current_round = p_round_number,
         current_turn_team = null,
         round_id = v_round_id
   where id = p_room_id;

  return v_round_id;
end $$;

-- create_round is internal — deny the Data API for both signatures.
revoke execute on function public.create_round(uuid, int) from public, anon, authenticated;
revoke execute on function public.create_round(uuid, int, text) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 5) start_game — the LEADER (or host) may start.
--    Each team must have at least one non-leader player so the race is fair.
-- ------------------------------------------------------------------
create or replace function public.start_game(p_room_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  r     record;
  np    int;
  ready int;
  has_red boolean := false;
  has_blue boolean := false;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  select id, host_id, leader_id, status into r from public.rooms where id = p_room_id;
  perform public.assert_true(r.id is not null, 'مفيش غرفة.');
  perform public.assert_true(r.host_id = v_uid or r.leader_id = v_uid,
    'انت مش صاحب الغرفة أو القائد.');
  perform public.assert_true(r.status = 'lobby', 'اللعبة بدأت بالفعل.');

  select count(*) into np from public.room_players where room_id = p_room_id;
  perform public.assert_true(np >= 3, 'لازم 3 لاعب على الأقل.');
  select count(*) filter (where is_ready) into ready
    from public.room_players where room_id = p_room_id;
  perform public.assert_true(ready = np, 'مش كل اللاعيبة جاهزين.');

  -- Both teams need at least one player who can answer (not the leader).
  select true into has_red from public.room_players
   where room_id = p_room_id and team='red' and user_id <> r.leader_id limit 1;
  select true into has_blue from public.room_players
   where room_id = p_room_id and team='blue' and user_id <> r.leader_id limit 1;
  perform public.assert_true(has_red and has_blue,
    'لازم في لاعب واحد على الأقل في كل فريق يقدر يجاوب (مش القائد).');

  perform public.seed_challenges();
  update public.rooms set status='playing', red_score=0, blue_score=0,
                        winner=null, winner_name=null where id = p_room_id;
  perform public.create_round(p_room_id, 1);
  return query select true;
end $$;

-- ------------------------------------------------------------------
-- 6) submit_clue — unchanged behavior: only the current round's leader
--    (the room leader synced at round creation / change_leader) submits.
-- ------------------------------------------------------------------
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
         round.leader_id, round.ends_at
    into r
  from public.rooms room
  join public.rounds round on round.id = p_round_id and round.room_id = room.id
  where room.id = p_room_id;
  perform public.assert_true(r.rstatus is not null, 'مفيش جولة.');
  perform public.assert_true(r.status='playing', 'اللعبة مش شغالة.');
  perform public.assert_true(r.round_id = p_round_id, 'دي مش الجولة الحالية.');
  perform public.assert_true(r.rstatus='leader', 'التلميح اتسلم من قبل كده.');
  perform public.assert_true(r.leader_id = v_uid, 'انت مش قائد الجولة.');
  perform public.assert_true(r.ends_at is null or r.ends_at > now(), 'خلص وقت الجولة.');

  update public.rounds
     set clue = clue_text, status = 'clue_submitted', clue_submitted_at = now()
   where id = p_round_id;
  return query select true;
end $$;

-- ------------------------------------------------------------------
-- 7) submit_answer — TEAM RACE. First correct answer (in DB) wins.
--    A row lock on the round serializes every answer so exactly one
--    team can win — the transaction that first marks the round revealed.
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

  select status, round_id, leader_id into room_rec
    from public.rooms where id = p_room_id;
  perform public.assert_true(room_rec.status is not null, 'مفيش غرفة.');
  perform public.assert_true(room_rec.status = 'playing', 'اللعبة مش شغالة.');
  perform public.assert_true(room_rec.round_id = p_round_id, 'دي مش الجولة الحالية.');

  -- Race-condition protection: every answer serializes on the round row.
  -- Whoever gets the lock first and reveals the round wins; later calls
  -- re-read status='revealed' and are rejected.
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
  perform public.assert_true(player_rec.team in ('red','blue'), 'لازم تختار فريق الأول.');
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

  -- Record the attempt. Duplicate (same player, or same team+choice) is caught
  -- and turned into a friendly Arabic error.
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
           winning_team = player_rec.team,
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

    if player_rec.team = 'red' then
      update public.rooms set red_score = red_score + v_score_delta where id = p_room_id;
    else
      update public.rooms set blue_score = blue_score + v_score_delta where id = p_room_id;
    end if;

    update public.room_players set score = score + v_score_delta, online = true
     where room_id = p_room_id and user_id = v_uid;
  end if;

  return jsonb_build_object(
    'correct',        v_correct,
    'round_revealed', v_correct,
    'winning_team',   case when v_correct then player_rec.team else null end,
    'correct_index',  case when v_correct then v_secret else null end,
    'score_delta',    v_score_delta
  );
end $$;

-- ------------------------------------------------------------------
-- 8) next_round — the host OR leader advances; never creates a round
--    after game over (RETURN fix preserved).
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
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  select id, host_id, leader_id, status, current_round, round_id, red_score, blue_score
    into r from public.rooms where id = p_room_id;
  perform public.assert_true(r.id is not null, 'مفيش غرفة.');
  perform public.assert_true(r.host_id = v_uid or r.leader_id = v_uid,
    'انت مش صاحب الغرفة أو القائد.');
  perform public.assert_true(r.status = 'playing', 'اللعبة مش شغالة.');
  perform public.assert_true(r.round_id = p_round_id, 'دي مش الجولة الحالية.');

  -- Serialize with submit_answer / expire_round on the same round row.
  perform 1 from public.rounds where id = p_round_id for update;

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
    return;
  end if;

  perform public.create_round(p_room_id, r.current_round + 1);
  return query select true;
  return;
end $$;

-- ------------------------------------------------------------------
-- 9) expire_round — server-authoritative timeout, NO winner, then advances.
--    Cannot run before ends_at, cannot run twice, no round after game over.
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

  if room_rec.current_round >= 6 then
    red := coalesce(room_rec.red_score, 0);
    blue := coalesce(room_rec.blue_score, 0);
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

-- ------------------------------------------------------------------
-- 10) change_leader — ONLY the current leader may hand off leadership to
--     another member of the same room. Blocked while a race is running.
-- ------------------------------------------------------------------
create or replace function public.change_leader(p_room_id uuid, p_target_user_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  room_rec record;
  cur_round record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(p_target_user_id is not null, 'اختر اللاعب الجديد.');

  select leader_id into room_rec from public.rooms where id = p_room_id;
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

  update public.rooms set leader_id = p_target_user_id where id = p_room_id;
  update public.room_players set is_leader = (user_id = p_target_user_id)
   where room_id = p_room_id;

  -- If a clue phase is in progress, the new leader takes over the hint.
  update public.rounds set leader_id = p_target_user_id
   where id in (select round_id from public.rooms where id = p_room_id)
     and status = 'leader';

  return query select true;
end $$;

grant execute on function public.change_leader to authenticated;

-- ------------------------------------------------------------------
-- 11) create_room / join_room / set_team / leave_room — single leader
-- ------------------------------------------------------------------
create or replace function public.create_room(p_team text)
returns table(room_id uuid, code text) language plpgsql security definer set search_path = public as
$$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_team   text := coalesce(p_team, 'red');
  v_room   uuid := gen_random_uuid();
  v_code   text;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  prof     record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
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
                                red_score, blue_score, winner, winner_name)
      values (v_room, v_code, v_uid, v_uid, 'lobby', 8, 0, null, null, 0, 0, null, null);
      exit;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  perform public.assert_true(v_code is not null, 'مقدرناش نعمل كود دلوقتي، جرب تاني.');

  -- The room creator is the ONE room leader.
  insert into public.room_players (room_id, user_id, username, avatar, team,
                                   is_leader, is_ready, online, score)
  values (v_room, v_uid, prof.username, prof.avatar, v_team, true, false, true, 0);

  return query select v_room, v_code;
end $$;

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

  select count(*) filter (where team='red') as red,
         count(*) filter (where team='blue') as blue
    into counts from public.room_players where room_id = room.id;

  perform public.assert_true((counts.red + counts.blue) < room.max_players, 'الغرفة مليانة.');
  team := case when counts.red <= counts.blue then 'red' else 'blue' end;

  -- No per-team leaders anymore: only the room creator is the leader.
  insert into public.room_players (room_id, user_id, username, avatar, team,
                                   is_leader, is_ready, online, score)
  values (room.id, v_uid, prof.username, prof.avatar, team, false, false, true, 0);

  return query select room.id;
end $$;

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

  select * into me from public.room_players where room_id = p_room_id and user_id = v_uid;
  perform public.assert_true(me.user_id is not null, 'أنت مش في الغرفة.');
  if me.team = v_team then return query select true; return; end if;

  select id, status, round_id, leader_id into room from public.rooms where id = p_room_id;
  perform public.assert_true(room.id is not null, 'مفيش غرفة.');

  -- Team changes are allowed in the lobby and between rounds, but NOT while
  -- an answer race is live (this also lets an ex-leader pick a team).
  if room.status = 'playing' then
    select status into cur_round from public.rounds where id = room.round_id;
    perform public.assert_true(cur_round.status is null or cur_round.status <> 'clue_submitted',
      'مفيش تغيير فريق أثناء سباق الإجابة.');
  end if;

  update public.room_players
     set team = v_team, is_ready = false
   where room_id = p_room_id and user_id = v_uid;

  -- The single room leader keeps their badge wherever they are.
  update public.room_players set is_leader = (user_id = room.leader_id)
   where room_id = p_room_id;

  return query select true;
end $$;

create or replace function public.leave_room(p_room_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid  uuid := auth.uid();
  room   public.rooms%rowtype;
  me     public.room_players%rowtype;
  successor uuid;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  select * into room from public.rooms where id = p_room_id;
  if room.id is null then return query select true; return; end if;

  select * into me from public.room_players where room_id = p_room_id and user_id = v_uid;
  if me.user_id is not null then
    -- If the room leader leaves, another member inherits leadership.
    if room.leader_id = v_uid then
      select user_id into successor from public.room_players
       where room_id = p_room_id and user_id <> v_uid
       order by (team is null) asc, joined_at asc
       limit 1;
      if successor is not null then
        update public.rooms set leader_id = successor where id = p_room_id;
      end if;
    end if;

    delete from public.room_players where room_id = p_room_id and user_id = v_uid;

    update public.room_players p
       set is_leader = (p.user_id = r.leader_id)
      from public.rooms r
     where r.id = p_room_id and p.room_id = p_room_id;

    if not exists (select 1 from public.room_players where room_id = p_room_id) then
      delete from public.rooms where id = p_room_id;
    end if;
  end if;
  return query select true;
end $$;

-- ------------------------------------------------------------------
-- 12) RLS: chat is open to EVERY room member during the answer race
--     (both teams play at the same time now).
-- ------------------------------------------------------------------
drop policy if exists "messages: active team may insert" on public.messages;
drop policy if exists "messages: members may insert during answer phase" on public.messages;
create policy "messages: members may insert during answer phase"
  on public.messages for insert
  with check (
    public.fn_is_room_member(room_id)
    and sender_id = auth.uid()
    and exists (
      select 1 from public.rounds r
       where r.id = messages.round_id
         and r.room_id = messages.room_id
         and r.status = 'clue_submitted'
    )
  );

-- ------------------------------------------------------------------
-- 13) Grants — the race/leader RPCs stay available to authenticated.
-- ------------------------------------------------------------------
grant execute on function public.start_game to authenticated;
grant execute on function public.submit_clue to authenticated;
grant execute on function public.submit_answer to authenticated;
grant execute on function public.next_round to authenticated;
grant execute on function public.expire_round to authenticated;