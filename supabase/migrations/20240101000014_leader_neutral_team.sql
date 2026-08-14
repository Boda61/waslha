-- ============================================================
-- Waslha — Neutral Leader (outside both teams)
-- The room leader (the clue-giver) is NO LONGER part of either
-- team. The leader:
--   * never belongs to a team (room_players.team = NULL)
--   * never answers, never earns points
--   * is excluded from the final MVP list (handled client-side)
-- When leadership is handed off, the new leader steps out of
-- their team and the old leader re-joins the least-populated team.
-- Idempotent: safe to re-run. No data loss.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) create_room — the room creator is the leader, OUTSIDE both teams.
--    p_team is ignored: the creator is neutral from the start.
-- ------------------------------------------------------------------
create or replace function public.create_room(p_team text default 'red')
returns table(room_id uuid, code text) language plpgsql security definer set search_path = public as
$$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_room   uuid := gen_random_uuid();
  v_code   text;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  prof     record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');

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

  -- The room creator is the ONE neutral leader (team = NULL).
  insert into public.room_players (room_id, user_id, username, avatar, team,
                                   is_leader, is_ready, online, score)
  values (v_room, v_uid, prof.username, prof.avatar, null, true, false, true, 0);

  return query select v_room, v_code;
end $$;

-- ------------------------------------------------------------------
-- 2) join_room — balanced teams as before; capacity now counts the
--    neutral leader too (so max_players is the true total).
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

  select count(*) filter (where team='red') as red,
         count(*) filter (where team='blue') as blue
    into counts from public.room_players where room_id = room.id;

  select count(*) into total from public.room_players where room_id = room.id;
  perform public.assert_true(total < room.max_players, 'الغرفة مليانة.');
  team := case when counts.red <= counts.blue then 'red' else 'blue' end;

  -- Every joiner is a regular team player (no per-team leaders).
  insert into public.room_players (room_id, user_id, username, avatar, team,
                                   is_leader, is_ready, online, score)
  values (room.id, v_uid, prof.username, prof.avatar, team, false, false, true, 0);

  return query select room.id;
end $$;

-- ------------------------------------------------------------------
-- 3) set_team — the CURRENT leader is neutral and cannot join a team.
--    Ex-leaders (after handing off leadership) may pick a team.
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

  select * into me from public.room_players where room_id = p_room_id and user_id = v_uid;
  perform public.assert_true(me.user_id is not null, 'أنت مش في الغرفة.');
  if me.team = v_team then return query select true; return; end if;

  select id, status, round_id, leader_id into room from public.rooms where id = p_room_id;
  perform public.assert_true(room.id is not null, 'مفيش غرفة.');
  perform public.assert_true(room.leader_id <> v_uid,
    'القائد بره الفريقين — سلم القيادة الأول لو عايز تلعب.');

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

-- ------------------------------------------------------------------
-- 4) change_leader — hand off: the new leader steps OUT of their team
--    (neutral), the old leader re-joins the least-populated team.
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

  -- New leader leaves their team and becomes the neutral clue-giver.
  update public.room_players
     set is_leader = true, team = null, is_ready = false
   where room_id = p_room_id and user_id = p_target_user_id;

  -- Old leader returns to the least-populated team so they can play.
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

  update public.rooms set leader_id = p_target_user_id where id = p_room_id;

  -- If a clue phase is in progress, the new leader takes over the hint.
  update public.rounds set leader_id = p_target_user_id
   where id in (select round_id from public.rooms where id = p_room_id)
     and status = 'leader';

  return query select true;
end $$;

-- ------------------------------------------------------------------
-- 5) leave_room — if the leader leaves, the successor inherits
--    leadership and steps out of their team (neutral).
-- ------------------------------------------------------------------
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
        -- Successor steps out of their team to become the neutral leader.
        update public.room_players
           set is_leader = true, team = null, is_ready = false
         where room_id = p_room_id and user_id = successor;
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
-- 6) Grants — keep the leader/team RPCs available to authenticated.
-- ------------------------------------------------------------------
grant execute on function public.create_room to authenticated;
grant execute on function public.join_room to authenticated;
grant execute on function public.set_team to authenticated;
grant execute on function public.change_leader to authenticated;
grant execute on function public.leave_room to authenticated;
