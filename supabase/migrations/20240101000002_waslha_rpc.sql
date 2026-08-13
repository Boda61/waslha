-- ============================================================
-- Part 3: Server-side game logic (security-definer RPCs)
-- Replaces every Firebase Cloud Function in functions/index.js.
-- Each RPC validates auth.uid() itself (defense in depth) even
-- though RLS also protects the tables.
-- ============================================================

-- Reusable assertion helper. Raises a user-facing error (SQLSTATE P0001)
-- so the frontend surfaces the Arabic message directly.
create or replace function public.assert_true(
  p_cond boolean,
  p_message text
) returns void language plpgsql as $$
begin
  if not p_cond then
    raise exception '%', p_message using ERRCODE := 'P0001';
  end if;
end $$;

-- update_username replaces Cloud Function `updateUsername`.
create or replace function public.update_username(p_username text)
returns table(username text) language plpgsql security definer set search_path = public as
$$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_name text := trim(coalesce(p_username, ''));
  existing uuid;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(length(v_name) between 2 and 20, 'الاسم لازم يبقى بين 2 و 20 حرف.');
  perform public.assert_true(position(' ' in v_name) = 0, 'الاسم ممنوع يحتوي مسافة.');

  select profiles.id into existing from public.profiles
   where lower(profiles.username) = lower(v_name) and profiles.id <> v_uid limit 1;
  perform public.assert_true(not found, 'الاسم ده متاخد. جرب اسم تاني.');

  update public.profiles set username = v_name where profiles.id = v_uid;
  return query select p.username from public.profiles p where p.id = v_uid;
end $$;

-- update_avatar replaces Cloud Function `updateAvatar`.
create or replace function public.update_avatar(p_avatar text)
returns table(avatar text) language plpgsql security definer set search_path = public as
$$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_avatar text := left(coalesce(nullif(p_avatar, ''), '🦁'), 4);
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  update public.profiles set avatar = v_avatar where profiles.id = v_uid;
  return query select p.avatar from public.profiles p where p.id = v_uid;
end $$;


-- ============================================================
-- ROOMS
-- ============================================================

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

  -- Generate a unique 5-char code (roomCodes lock → rooms.code uniqueness).
  for i in 1..10 loop
    v_code := '';
    for _ in 1..5 loop
      v_code := v_code || substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1);
    end loop;
    begin
      insert into public.rooms (id, code, host_id, status, max_players,
                                current_round, current_turn_team, round_id,
                                red_score, blue_score, winner, winner_name)
      values (v_room, v_code, v_uid, 'lobby', 8, 0, null, null, 0, 0, null, null);
      exit;  -- success
    exception when unique_violation then
      v_code := null;  -- collision, retry
    end;
  end loop;
  perform public.assert_true(v_code is not null, 'مقدرناش نعمل كود دلوقتي، جرب تاني.');

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
  is_lead   boolean;
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
  is_lead := case when (select count(*) from public.room_players where room_id=room.id and team=team) = 0 then true else false end;

  insert into public.room_players (room_id, user_id, username, avatar, team,
                                   is_leader, is_ready, online, score)
  values (room.id, v_uid, prof.username, prof.avatar, team, is_lead, false, true, 0);

  return query select room.id;
end $$;

create or replace function public.set_team(p_room_id uuid, p_team text)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  v_team text := coalesce(p_team, 'red');
  me room_players%rowtype;
  joining_empty boolean;
  old_leader uuid;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(v_team in ('red','blue'), 'فريق غير صحيح.');

  select * into me from public.room_players where room_id = p_room_id and user_id = v_uid;
  perform public.assert_true(me.user_id is not null, 'أنت مش في الغرفة.');

  if me.team = v_team then return query select true; return; end if;

  if exists (select 1 from public.rooms r where r.id=p_room_id and r.status='lobby') = false then
    perform public.assert_true(false, 'مفيش تغيير فريق بعد ما اللعبة بدأت.');
  end if;

  if me.team is not null and me.is_leader then
    select user_id into old_leader from public.room_players
     where room_id = p_room_id and team = me.team and user_id <> v_uid limit 1;
    if old_leader is not null then
      update public.room_players set is_leader = true where room_id=p_room_id and user_id=old_leader;
    end if;
  end if;

  joining_empty := (select count(*) from public.room_players where room_id=p_room_id and team=v_team) = 0;
  update public.room_players
     set team = v_team, is_leader = joining_empty, is_ready = false
   where room_id = p_room_id and user_id = v_uid;

  return query select true;
end $$;

create or replace function public.set_online(p_room_id uuid, p_online boolean)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  update public.room_players
   set online = p_online
   where room_id = p_room_id and user_id = v_uid;
end $$;


-- ============================================================
-- AUTH & PROFILE
-- ============================================================

-- register_profile replaces Cloud Function `registerUser`.
-- The auth.users row is created by supabase.auth.signUp; this RPC creates
-- the public.profiles row and enforces username uniqueness server-side.
create or replace function public.register_profile(p_username text, p_avatar text default '🦁')
returns table(id uuid, username text, avatar text, email text)
language plpgsql security definer set search_path = public as
$$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_name text := trim(coalesce(p_username, ''));
  v_avatar text := coalesce(nullif(p_avatar, ''), '🦁');
  v_email  text;
  existing uuid;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(length(v_name) between 2 and 20, 'الاسم لازم يبقى بين 2 و 20 حرف.');
  perform public.assert_true(position(' ' in v_name) = 0, 'الاسم ممنوع يحتوي مسافة.');

  select profiles.id into existing from public.profiles
   where lower(profiles.username) = lower(v_name) and profiles.id <> v_uid limit 1;
  perform public.assert_true(not found, 'الاسم ده متاخد. جرب اسم تاني.');

  select email into v_email from auth.users where id = v_uid;
  insert into public.profiles (id, username, avatar, email, games_played, wins)
  values (v_uid, v_name, v_avatar, v_email, 0, 0)
  on conflict (id) do update
     set username = excluded.username,
         avatar   = excluded.avatar,
         email    = coalesce(profiles.email, excluded.email);

  return query
  select p.id, p.username, p.avatar, p.email
  from public.profiles p
  where p.id = v_uid;
end $$;

create or replace function public.set_ready(p_room_id uuid, p_ready boolean)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(
    exists (select 1 from public.rooms r join public.room_players p on p.room_id=r.id
            where r.id=p_room_id and p.user_id=v_uid and r.status='lobby'),
    'الغرفة مش في مرحلة التحضير.');
  update public.room_players set is_ready = p_ready
   where room_id = p_room_id and user_id = v_uid;
  return query select true;
end $$;

create or replace function public.leave_room(p_room_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid  uuid := auth.uid();
  room   public.rooms%rowtype;
  me     public.room_players%rowtype;
  new_leader uuid;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  select * into room from public.rooms where id = p_room_id;
  if room.id is null then return query select true; return; end if;

  select * into me from public.room_players where room_id = p_room_id and user_id = v_uid;
  if me.user_id is not null then
    if me.is_leader and room.status = 'lobby' then
      select user_id into new_leader from public.room_players
       where room_id = p_room_id and user_id <> v_uid and team = me.team limit 1;
      if new_leader is not null then
        update public.room_players set is_leader = true
         where room_id = p_room_id and user_id = new_leader;
      end if;
    end if;
    delete from public.room_players where room_id = p_room_id and user_id = v_uid;
    if not exists (select 1 from public.room_players where room_id = p_room_id) then
      delete from public.rooms where id = p_room_id;
    end if;
  end if;
  return query select true;
end $$;


create or replace function public.seed_challenges()
returns void language plpgsql security definer set search_path = public as
$$
begin
  if exists (select 1 from public.challenges) then return; end if;
  insert into public.challenges
    (id, title, image_a_emoji, image_a_label, image_b_emoji, image_b_label,
     choices, category, difficulty, active)
  values
    ('c01','شرب الصبح','☕','قهوة الصبح','🥛','لبن',
      '["مشروبات","أكل شامي","حلويات","فواكه"]','حاجات','سهل',true),
    ('c02','في المطبخ','🥄','معلقة','🍳','طاسة',
      '["أدوات مطبخ","نوم","قراءة","لعب"]','حاجات','سهل',true),
    ('c03','الدراسة','📚','كتاب','✏️','قلم',
      '["أدوات مكتبية","ملابس","أثاث","ميكانيكا"]','أماكن','سهل',true),
    ('c04','الفواكه الحلوة','🍉','بطيخ','🍌','موز',
      '["فواكه","خضار","أكل بحري","لحوم"]','أكل','سهل',true),
    ('c05','فيه حيوانات','🐱','قطة','🐶','كلب',
      '["حيوانات أليفة","طيور برية","حشرات","زواحف"]','حيوانات','سهل',true),
    ('c06','النقل','🚗','عربية','🛵','توك توك',
      '["مواصلات","طيارات","سفن","قطارات"]','مواصلات','متوسط',true),
    ('c07','الصلاة','🕌','مسجد','📿','سبحة',
      '["حاجات دينية","هدوم","كتب أجنبية","موسيقى"]','دين','متوسط',true),
    ('c08','الحفلة','🎂','كيكة','🎈','بالونة',
      '["احتفال","عزاء","دوام","رياضة"]','مناسبات','متوسط',true),
    ('c09','الصيف','😎','نضارة شمس','🏖️','شاط',
      '["الاجازة","الشتا","الشغل","الدراسة"]','مواسم','متوسط',true),
    ('c10','السوق','🥬','خضار','🍅','طماطم',
      '["خضار وفاكهة","هدوم","موبايلات","أثاث"]','أكل','سهل',true),
    ('c11','الشغل','💻','لابتوب','💼','شنطة',
      '["مكتب وشغل","مطبخ","حمام","شارع"]','أماكن','متوسط',true),
    ('c12','الحيوانات البرية','🦁','أسد','🐘','فيل',
      '["حيوانات برية","أسماك","طيور","حشرات"]','حيوانات','سهل',true);

  insert into public.challenge_secrets (challenge_id, correct_index) values
    ('c01',0),('c02',0),('c03',0),('c04',0),('c05',0),('c06',0),
    ('c07',0),('c08',0),('c09',0),('c10',0),('c11',0),('c12',0)
  on conflict (challenge_id) do nothing;
end $$;

create or replace function public.pick_challenge()
returns table(id text, title text, image_a_emoji text, image_a_label text,
              image_b_emoji text, image_b_label text, choices jsonb,
              category text, difficulty text)
language sql security definer set search_path = public as
$$
  select id, title, image_a_emoji, image_a_label, image_b_emoji, image_b_label,
         choices, category, difficulty
  from public.challenges
  where active
  order by random()
  limit 1;
$$;

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
                             challenge_id, status, score_delta, started_at)
  values (v_round_id, p_room_id, p_round_number, p_team, leader_uid, chal.id,
          'leader', 0, now());

  update public.rooms
     set current_round = p_round_number,
         current_turn_team = p_team,
         round_id = v_round_id
   where id = p_room_id;

  return v_round_id;
end $$;


create or replace function public.start_game(p_room_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  r     record;
  np    int;
  ready int;
  has_red boolean;
  has_blue boolean;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  select id, host_id, status into r from public.rooms where id = p_room_id;
  perform public.assert_true(r.id is not null, 'مفيش غرفة.');
  perform public.assert_true(r.host_id = v_uid, 'انت مش صاحب الغرفة.');
  perform public.assert_true(r.status = 'lobby', 'اللعبة بدأت بالفعل.');

  select count(*) into np from public.room_players where room_id = p_room_id;
  perform public.assert_true(np >= 3, 'لازم 3 لاعب على الأقل.');
  select count(*) filter (where is_ready) into ready from public.room_players where room_id = p_room_id;
  perform public.assert_true(ready = np, 'مش كل اللاعيبة جاهزين.');
  select true into has_red from public.room_players where room_id=p_room_id and team='red' limit 1;
  select true into has_blue from public.room_players where room_id=p_room_id and team='blue' limit 1;
  perform public.assert_true(has_red and has_blue, 'لازم في لاعب واحد على الأقل في كل فريق.');

  perform public.seed_challenges();
  update public.rooms set status='playing', red_score=0, blue_score=0,
                        winner=null, winner_name=null where id = p_room_id;
  perform public.create_round(p_room_id, 1, 'red');
  return query select true;
end $$;

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

  select room.status as status, room.round_id, round.status as rstatus, round.leader_id
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


create or replace function public.submit_answer(p_room_id uuid, p_round_id uuid, p_choice_index int)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  room_rec record;
  round_rec record;
  player_rec record;
  secret int;
  choices jsonb;
  choice_text text;
  correct boolean;
  score_delta int := 0;
  active_size int;
  pred_rec record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(p_choice_index is not null and p_choice_index between 0 and 3, 'اختيار غير صحيح.');

    select room.status, room.round_id, room.red_score, room.blue_score,
         r.status as rstatus, r.active_team, r.leader_id, r.challenge_id,
         r.selected_choice_index
    into room_rec
  from public.rooms room
  join public.rounds r on r.id = p_round_id and r.room_id = room.id
  where room.id = p_room_id;

  perform public.assert_true(room_rec.rstatus is not null, 'مفيش جولة.');
  perform public.assert_true(room_rec.status='playing', 'اللعبة مش شغالة.');
  perform public.assert_true(room_rec.round_id = p_round_id, 'دي مش الجولة الحالية.');
  perform public.assert_true(room_rec.rstatus <> 'leader', 'القائد لسه مبعتش التلميح.');

  select user_id, team, score into player_rec
   from public.room_players where room_id=p_room_id and user_id=v_uid;
  perform public.assert_true(player_rec.user_id is not null, 'أنت مش في الغرفة.');
  perform public.assert_true(player_rec.team = room_rec.active_team, 'الفريق التاني مش بيجاوب.');
  select count(*) into active_size from public.room_players
   where room_id=p_room_id and team=room_rec.active_team;
  perform public.assert_true(not (v_uid = room_rec.leader_id and active_size > 1), 'انت القائد — متختارش نيابة عن الفريق.');
  -- prevent duplicate answer submission
    if room_rec.selected_choice_index is not null then
    perform public.assert_true(false, 'الإجابة اتسجلت قبل كده — ممنوع تكرر.');
  end if;

  -- read the protected correct answer (challenge_secrets is never readable by clients)
  select correct_index into secret from public.challenge_secrets where challenge_id = room_rec.challenge_id;
  perform public.assert_true(secret is not null, 'الإجابة السرية مش موجودة — اتصل بالأدمن.');
  select choices into choices from public.challenges where id = room_rec.challenge_id;
  choice_text := choices[p_choice_index + 1];
  correct := (p_choice_index = secret);
  score_delta := case when correct then 100 else 0 end;

  update public.rounds
     set status='revealed', selected_choice_index=p_choice_index, selected_answer=choice_text,
         submitted_by=v_uid, correct_index=secret,
         correct_answer=choices[secret+1],
         result = case when correct then 'correct' else 'incorrect' end,
         score_delta=score_delta, answered_at=now()
   where id = p_round_id;

  if room_rec.active_team='red' then
    update public.rooms set red_score = red_score + score_delta where id=p_room_id;
  else
    update public.rooms set blue_score = blue_score + score_delta where id=p_room_id;
  end if;

  update public.room_players set score = score + score_delta, online=true
   where room_id=p_room_id and user_id=v_uid;

  -- reward correct predictions of the OPPOSITE team (20 points each)
  for pred_rec in
    select user_id, choice_index from public.predictions where round_id=p_round_id
  loop
    if pred_rec.choice_index = secret then
      update public.room_players set score = score + 20
       where room_id=p_room_id and user_id=pred_rec.user_id;
    end if;
  end loop;

  return jsonb_build_object('correct', correct, 'correct_index', secret, 'score_delta', score_delta);
end $$;


create or replace function public.submit_prediction(p_room_id uuid, p_round_id uuid, p_choice_index int)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  r record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(p_choice_index is not null and p_choice_index between 0 and 3, 'اختيار غير صحيح.');

  select room.status, room.round_id, r.active_team, r.status as rstatus
    into r
  from public.rooms room
  join public.rounds r on r.id = p_round_id and r.room_id = room.id
  where room.id = p_room_id;
  perform public.assert_true(r.rstatus is not null, 'مفيش جولة.');
  perform public.assert_true(r.status='playing', 'اللعبة مش شغالة.');
  perform public.assert_true(r.round_id = p_round_id, 'دي مش الجولة الحالية.');
  perform public.assert_true(r.rstatus='clue_submitted', 'التوقع متاح بس في وقت الإجابة.');

  -- Only the OPPOSITE team can predict.
  perform public.assert_true(
    exists (select 1 from public.room_players
             where room_id=p_room_id and user_id=v_uid and team <> r.active_team),
    'الفريق اللي عليه الدور مش بيعمل توقعات.');

  perform public.assert_true(
    not exists (select 1 from public.predictions where round_id=p_round_id and user_id=v_uid),
    'لما تعمل توقع تقدرش تغيره خالص.');

  insert into public.predictions (round_id, user_id, choice_index)
  values (p_round_id, v_uid, p_choice_index)
  on conflict (round_id, user_id) do update set choice_index = p_choice_index;

  return query select true;
end $$;

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
  winner text;
  winner_name text;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  select id, host_id, status, current_round, current_turn_team,
         red_score, blue_score into r
  from public.rooms where id = p_room_id;
  perform public.assert_true(r.id is not null, 'مفيش غرفة.');
  perform public.assert_true(r.host_id = v_uid, 'انت مش صاحب الغرفة.');
  perform public.assert_true(r.status = 'playing', 'اللعبة مش شغالة.');
  perform public.assert_true(r.current_turn_team is not null, 'لا جولة حالية.');

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

    -- update player stats: games_played + (wins if on winning team)
    for rec in select user_id, team, score from public.room_players where room_id=p_room_id
    loop
      update public.profiles p
         set games_played = games_played + 1,
             wins = wins + case when (winner <> 'tie' and rec.team = winner) then 1 else 0 end
       where p.id = rec.user_id;
    end loop;
    return query select true;
  end if;

  -- start next round, switch active team
  next_team := case when r.current_turn_team='red' then 'blue' else 'red' end;
  perform public.create_round(p_room_id, r.current_round + 1, next_team);
  return query select true;
end $$;

-- ============================================================
-- GRANTS: let authenticated users call every RPC.
-- ============================================================
grant execute on function public.register_profile to authenticated;
grant execute on function public.update_username to authenticated;
grant execute on function public.update_avatar to authenticated;
grant execute on function public.set_online to authenticated;
grant execute on function public.create_room to authenticated;
grant execute on function public.join_room to authenticated;
grant execute on function public.set_team to authenticated;
grant execute on function public.set_ready to authenticated;
grant execute on function public.leave_room to authenticated;
grant execute on function public.start_game to authenticated;
grant execute on function public.submit_clue to authenticated;
grant execute on function public.submit_answer to authenticated;
grant execute on function public.submit_prediction to authenticated;
grant execute on function public.next_round to authenticated;




-- ============================================================
-- Seed challenges on first migration so the game is playable
-- with ZERO manual steps (idempotent — safe to re-run).
-- ============================================================
select public.seed_challenges();

