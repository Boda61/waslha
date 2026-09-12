-- ============================================================
-- Waslha — Hebd Mode — Part 3A: Match + Lobby RPCs
-- Server-side state machine for Hebd rooms (SCHEMA READY).
--   * fn_hebd_normalize   : internal Arabic guess normalizer
--   * create_hebd_room    : create room + match + categories
--   * get_room_mode       : probe room mode by code (join routing)
--   * join_hebd_room      : join (max 2, race-safe)
--   * set_hebd_ready      : toggle own readiness
--   * start_hebd_match    : host starts + creates round 1
--   * create_hebd_round   : INTERNAL — creates one round
-- Follows the exact Classic conventions: SECURITY DEFINER,
-- set search_path = public, auth.uid() + assert_true guards,
-- FOR UPDATE locks where transitions can race, internal
-- helpers revoked from anon/authenticated.
-- No gameplay RPCs (cards / guesses / timer / scoring) yet.
-- ============================================================

-- ------------------------------------------------------------
-- 1) fn_hebd_normalize — internal deterministic Arabic normalizer
--    Used later by guess validation. NEVER exposes secrets.
--    Pure immutable SQL helper; not callable by clients.
-- ------------------------------------------------------------
create or replace function public.fn_hebd_normalize(p_input text)
returns text
language sql
immutable
security definer
set search_path = public
as $function$
  select nullif(
    btrim(
      regexp_replace(
        translate(
          translate(
            lower(coalesce(p_input, '')),
            -- aأ/إ/آ/ٱ -> ا | ؤ -> و | ئ/ى -> ي | ة -> ه | Arabic & Persian digits -> latin
            'أإآٱؤئىة٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹ـًٌَُِّْٰ',
            'اااااويايها01234567890123456789'
          ),
          -- strip zero-width joiner / non-joiner (invisible)
          chr(8204) || chr(8205),
          ''
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$function$;

-- ------------------------------------------------------------
-- 2) create_hebd_room — atomic room + match + category order
-- ------------------------------------------------------------
create or replace function public.create_hebd_room(p_total_rounds integer, p_categories uuid[])
returns table(room_id uuid, code text)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_room   uuid := gen_random_uuid();
  v_code   text;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  prof     record;
  v_dups   int;
  v_valid  int;
  v_i      int;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(p_total_rounds between 1 and 10,
    'عدد الجولات لازم يبقى بين 1 و 10.');
  perform public.assert_true(p_categories is not null and cardinality(p_categories) >= 1,
    'اختار فئة واحدة على الأقل.');

  -- Duplicate category ids must be rejected.
  select count(*) into v_dups
    from (select unnest(p_categories) as c group by c having count(*) > 1) d;
  perform public.assert_true(v_dups = 0, 'الفئات ممنوع تتكرر.');

  -- Every supplied id must exist AND be active.
  select count(*) into v_valid
    from public.hebd_categories hc
   where hc.id = any (p_categories) and hc.active;
  perform public.assert_true(v_valid = cardinality(p_categories),
    'الفئات دي مش موجودة أو مش نشطة.');

  select id, username, avatar into prof from public.profiles where id = v_uid;
  perform public.assert_true(prof.id is not null, 'سجّل البروفايل الأول.');

  -- Same safe code approach as Classic create_room (unique_violation retry).
  for i in 1..10 loop
    v_code := '';
    for _ in 1..5 loop
      v_code := v_code || substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1);
    end loop;
    begin
      insert into public.rooms (id, code, host_id, leader_id, status, max_players,
                                current_round, current_turn_team, round_id,
                                red_score, blue_score, winner, winner_name, mode)
      values (v_room, v_code, v_uid, v_uid, 'lobby', 2, 0, null, null, 0, 0, null, null, 'hebd');
      exit;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  perform public.assert_true(v_code is not null,
    'مقدرناش نعمل كود دلوقتي، جرب تاني.');

  -- Creator is Hebd player #1 (no teams in Hebd).
  insert into public.room_players (room_id, user_id, username, avatar, team,
                                   is_leader, is_ready, online, score)
  values (v_room, v_uid, prof.username, prof.avatar, null, true, false, false, 0);

  insert into public.hebd_matches (room_id, total_rounds, current_round, status)
  values (v_room, p_total_rounds, 0, 'lobby');

  -- Preserve the supplied category order: position = 1,2,3...
  for v_i in 1..cardinality(p_categories) loop
    insert into public.hebd_match_categories (room_id, category_id, position)
    values (v_room, p_categories[v_i], v_i);
  end loop;

  return query select v_room, v_code;
end $function$;

-- ------------------------------------------------------------
-- 3) get_room_mode — minimal read-only probe for the join page.
--    Returns only the mode (or null). No private game data.
-- ------------------------------------------------------------
create or replace function public.get_room_mode(p_code text)
returns table(mode text)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid     uuid := auth.uid();
  code_norm text := upper(trim(coalesce(p_code, '')));
  r_mode    text;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  if length(code_norm) < 4 then return query select null::text; return; end if;

  select mode into r_mode from public.rooms where code = code_norm;
  return query select r_mode;
end $function$;

-- ------------------------------------------------------------
-- 4) join_hebd_room — join an open Hebd lobby (max 2).
--    The rooms row is locked FOR UPDATE BEFORE counting players,
--    so two concurrent joins can never both become the 3rd player.
-- ------------------------------------------------------------
create or replace function public.join_hebd_room(p_code text)
returns table(room_id uuid)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid     uuid := auth.uid();
  code_norm text := upper(trim(coalesce(p_code, '')));
  room      public.rooms%rowtype;
  prof      record;
  total     int;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(length(code_norm) >= 4, 'الكود مش صحيح.');

  -- Lock the room row first: serializes every concurrent join attempt.
  select * into room from public.rooms where code = code_norm for update;
  perform public.assert_true(room.id is not null, 'مفيش غرفة بالكود ده.');
  perform public.assert_true(room.mode = 'hebd', 'الغرفة دي مش مود هيبد.');
  perform public.assert_true(room.status = 'lobby',
    'الغرفة دي بدأت أو خلصت — متقدرش تدخل دلوقتي.');

  -- Already inside? return the room (idempotent, mirrors Classic join_room).
  if exists (select 1 from public.room_players
              where room_id = room.id and user_id = v_uid) then
    return query select room.id;
    return;
  end if;

  select count(*) into total from public.room_players where room_id = room.id;
  perform public.assert_true(total < 2, 'الغرفة مليانة — هيبد 2 لاعبين بس.');

  select id, username, avatar into prof from public.profiles where id = v_uid;
  perform public.assert_true(prof.id is not null, 'سجّل البروفايل الأول.');

  insert into public.room_players (room_id, user_id, username, avatar, team,
                                   is_leader, is_ready, online, score)
  values (room.id, v_uid, prof.username, prof.avatar, null, false, false, false, 0);

  return query select room.id;
end $function$;

-- ------------------------------------------------------------
-- 5) set_hebd_ready — caller toggles ONLY their own readiness.
-- ------------------------------------------------------------
create or replace function public.set_hebd_ready(p_room_id uuid, p_ready boolean)
returns table(ok boolean)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  r     record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');

  select id, mode, status into r from public.rooms where id = p_room_id;
  perform public.assert_true(r.id is not null, 'مفيش غرفة.');
  perform public.assert_true(r.mode = 'hebd', 'الغرفة دي مش مود هيبد.');
  perform public.assert_true(r.status = 'lobby', 'الغرفة دي بدأت أو خلصت.');

  update public.room_players
     set is_ready = coalesce(p_ready, false)
   where room_id = p_room_id and user_id = v_uid;
  perform public.assert_true(found, 'أنت مش في الغرفة.');

  return query select true;
end $function$;

-- ------------------------------------------------------------
-- 6) start_hebd_match — host starts; creates round 1 atomically.
-- ------------------------------------------------------------
create or replace function public.start_hebd_match(p_room_id uuid)
returns table(ok boolean)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid     uuid := auth.uid();
  r         record;
  v_players int;
  v_ready   int;
  v_cats    int;
  v_match   record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');

  -- Lock the room row: duplicate/concurrent starts serialize here.
  select id, host_id, status, mode into r
    from public.rooms where id = p_room_id for update;
  perform public.assert_true(r.id is not null, 'مفيش غرفة.');
  perform public.assert_true(r.mode = 'hebd', 'الغرفة دي مش مود هيبد.');
  perform public.assert_true(r.status = 'lobby', 'اللعبة بدأت بالفعل.');
  perform public.assert_true(r.host_id = v_uid, 'انت مش صاحب الغرفة.');

  select count(*) into v_players from public.room_players where room_id = p_room_id;
  perform public.assert_true(v_players = 2, 'لازم 2 لاعبين بالظبط.');

  select count(*) into v_ready
    from public.room_players where room_id = p_room_id and is_ready;
  perform public.assert_true(v_ready = 2, 'الاتنين لازم يكونوا جاهزين.');

  select total_rounds, status into v_match from public.hebd_matches where room_id = p_room_id;
  perform public.assert_true(v_match.status is not null, 'مفيش ماتش هيبد للغرفة دي.');
  perform public.assert_true(v_match.status = 'lobby', 'الماتش بدأ بالفعل.');

  select count(*) into v_cats from public.hebd_match_categories where room_id = p_room_id;
  perform public.assert_true(v_cats > 0, 'مفيش فئات مختارة.');

  update public.rooms set status = 'playing' where id = p_room_id;
  update public.hebd_matches set status = 'playing', current_round = 1
   where room_id = p_room_id;

  perform public.create_hebd_round(p_room_id, 1);

  return query select true;
end $function$;

-- ------------------------------------------------------------
-- 7) create_hebd_round — INTERNAL helper (revoked below).
--    Creates exactly one round: picks category by position
--    (cyclical), picks an unused active item, alternates
--    presenter/guesser, sets the authoritative 5-minute
--    deadline, and NEVER writes the secret answer.
-- ------------------------------------------------------------
create or replace function public.create_hebd_round(p_room_id uuid, p_round_number integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_round_id  uuid := gen_random_uuid();
  v_room      record;
  v_match     record;
  v_item      record;
  v_cat       uuid;
  v_cat_count int;
  v_presenter uuid;
  v_guesser   uuid;
begin
  -- Serialize round creation per room (same pattern as Classic create_round).
  perform 1 from public.rooms where id = p_room_id for update;

  select * into v_room from public.rooms where id = p_room_id;
  perform public.assert_true(v_room.id is not null, 'مفيش غرفة.');
  perform public.assert_true(v_room.mode = 'hebd', 'الغرفة دي مش مود هيبد.');

  select * into v_match from public.hebd_matches where room_id = p_room_id;
  perform public.assert_true(v_match.room_id is not null, 'مفيش ماتش هيبد للغرفة دي.');
  perform public.assert_true(p_round_number between 1 and v_match.total_rounds,
    'رقم الجولة مش صحيح.');

  if exists (select 1 from public.hebd_rounds
               where room_id = p_room_id and round_number = p_round_number) then
    perform public.assert_true(false, 'الجولة دي موجودة بالفعل.');
  end if;

  -- Category by position, cyclically: 1->first, 2->second, 3->third, 4->first...
  select count(*) into v_cat_count
    from public.hebd_match_categories where room_id = p_room_id;
  perform public.assert_true(v_cat_count > 0, 'مفيش فئات مختارة للماتش.');

  select category_id into v_cat
    from public.hebd_match_categories
   where room_id = p_room_id
   order by position asc
   limit 1 offset ((p_round_number - 1) % v_cat_count)::int;

  -- Item: active, in the selected category, never used before in this room.
  select * into v_item
    from public.hebd_items hi
   where hi.active
     and hi.category_id = v_cat
     and not exists (
       select 1 from public.hebd_rounds hr
        where hr.room_id = p_room_id and hr.item_id = hi.id
     )
   order by random()
   limit 1;
  perform public.assert_true(v_item.id is not null,
    'خلصت العناصر المتاحة في الفئة دي — اختار فئات تانية.');

  -- Fair, deterministic role alternation: odd rounds -> first player
  -- (the host) presents, even rounds -> second player presents.
  select user_id into v_presenter
    from public.room_players
   where room_id = p_room_id
   order by joined_at asc, user_id asc
   limit 1 offset ((p_round_number - 1) % 2)::int;

  select user_id into v_guesser
    from public.room_players
   where room_id = p_room_id and user_id <> v_presenter
   order by joined_at asc, user_id asc
   limit 1;

  perform public.assert_true(v_presenter is not null and v_guesser is not null,
    'لازم 2 لاعبين في الغرفة عشان الجولة.');

  -- answer stays NULL until the future reveal RPC (Phase 3B).
  insert into public.hebd_rounds (id, room_id, round_number, presenter_id, guesser_id,
                                  item_id, status, answer, green_hint, guesser_won,
                                  winner_user_id, score_delta, started_at, ends_at, revealed_at)
  values (v_round_id, p_room_id, p_round_number, v_presenter, v_guesser, v_item.id,
          'presenting', null, null, null, null, 0, now(), now() + interval '5 minutes', null);

  update public.hebd_matches
     set current_round = p_round_number,
         current_round_id = v_round_id,
         updated_at = now()
   where room_id = p_room_id;

  return v_round_id;
end $function$;

-- ------------------------------------------------------------
-- 8) Permissions — external RPCs only to authenticated;
--    internal helpers are NOT callable by clients.
-- ------------------------------------------------------------
grant execute on function public.create_hebd_room(integer, uuid[]) to authenticated;
grant execute on function public.get_room_mode(text) to authenticated;
grant execute on function public.join_hebd_room(text) to authenticated;
grant execute on function public.set_hebd_ready(uuid, boolean) to authenticated;
grant execute on function public.start_hebd_match(uuid) to authenticated;

revoke execute on function public.fn_hebd_normalize(text) from public, anon, authenticated;
revoke execute on function public.create_hebd_round(uuid, integer) from public, anon, authenticated;