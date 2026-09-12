-- ============================================================
-- Waslha — Hebd Mode — Part 3C: Cards RPCs (🔴 / 🟢)
--
-- Card rules (server-authoritative):
--   * Each player owns exactly 1 Red 🔴 and 1 Green 🟢 per match.
--   * Ownership/consumption is guaranteed by hebd_card_uses
--     PRIMARY KEY (room_id, user_id, card) — impossible to reuse.
--   * 🔴 Red (guesser only): creates exactly 3 question slots for the
--     current round; guesser asks, presenter answers, strictly in
--     order 1→2→3. Does NOT reveal the answer — the guesser still
--     guesses through submit_hebd_guess (unchanged from 3B).
--   * 🟢 Green (guesser only): asks the presenter for a hint; the
--     PRESENTER authors the hint text — the server NEVER derives it
--     from the secret and hebd_item_secrets stays untouched.
--
-- New tables (Hebd-only, no Classic impact):
--   hebd_red_card_questions — 3 slots per red-card use
--       UNIQUE (round_id, question_number) prevents duplicate slots.
--       `question` is nullable: slots are created as placeholders on
--       activation and filled strictly in order by the RPCs.
--   hebd_green_card_hints   — one hint request per round
--       UNIQUE (round_id); green is once per match so one row is enough.
--
-- Concurrency: every RPC locks the authoritative round row
-- (SELECT ... FOR UPDATE) first, so card use / question / answer /
-- hint calls all serialize on the same lock; PK + UNIQUE constraints
-- back the locks up at the storage level.
--
-- Security: SECURITY DEFINER + set search_path = public everywhere;
-- auth.uid() + assert_true guards (Classic conventions); the secret is
-- never read by any card RPC, never returned, never stored in card
-- tables, never published through Realtime.
-- ============================================================

-- ------------------------------------------------------------
-- 1) hebd_red_card_questions
-- ------------------------------------------------------------
create table public.hebd_red_card_questions (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms(id) on delete cascade,
  round_id        uuid not null references public.hebd_rounds(id) on delete cascade,
  guesser_id      uuid not null references auth.users(id),
  presenter_id    uuid not null references auth.users(id),
  question_number integer not null check (question_number between 1 and 3),
  question        text,
  answer          text,
  answered_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint hebd_red_card_questions_round_qnum_key
    unique (round_id, question_number)
);

create index hebd_red_card_questions_room_idx
  on public.hebd_red_card_questions (room_id);
create index hebd_red_card_questions_round_idx
  on public.hebd_red_card_questions (round_id, question_number);

-- ------------------------------------------------------------
-- 2) hebd_green_card_hints
-- ------------------------------------------------------------
create table public.hebd_green_card_hints (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  round_id     uuid not null references public.hebd_rounds(id) on delete cascade,
  requester_id uuid not null references auth.users(id),
  provider_id  uuid not null references auth.users(id),
  hint         text,
  requested_at timestamptz not null default now(),
  provided_at  timestamptz,
  constraint hebd_green_card_hints_round_id_key unique (round_id)
);

create index hebd_green_card_hints_room_idx
  on public.hebd_green_card_hints (room_id);

-- ------------------------------------------------------------
-- 3) RLS — room members may SELECT the card state only.
--    No INSERT/UPDATE/DELETE policies: all writes go through RPCs.
--    hebd_item_secrets is NOT touched (still zero policies).
-- ------------------------------------------------------------
alter table public.hebd_red_card_questions enable row level security;
alter table public.hebd_green_card_hints   enable row level security;

create policy "hebd_red_card_questions: members may select"
  on public.hebd_red_card_questions
  for select to authenticated
  using (public.fn_is_room_member(room_id));

create policy "hebd_green_card_hints: members may select"
  on public.hebd_green_card_hints
  for select to authenticated
  using (public.fn_is_room_member(room_id));

-- ------------------------------------------------------------
-- 4) Realtime — add the two card tables to the existing publication.
--    Nothing removed; hebd_item_secrets stays out.
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.hebd_red_card_questions;
alter publication supabase_realtime add table public.hebd_green_card_hints;

-- ------------------------------------------------------------
-- 5) use_hebd_red_card — the current guesser spends their 🔴.
--    Locks the round row so concurrent activations serialize; the
--    hebd_card_uses PK (room_id, user_id, card) rejects any second
--    use at the storage level even if a lock were bypassed.
--    Creates exactly 3 empty question slots (placeholders, filled in
--    order by the question/answer RPCs).
-- ------------------------------------------------------------
create or replace function public.use_hebd_red_card(p_room_id uuid)
returns table(ok boolean, round_id uuid, question_count integer)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_mode  text;
  v_match public.hebd_matches%rowtype;
  r       public.hebd_rounds%rowtype;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(
    exists (select 1 from public.room_players rp
             where rp.room_id = p_room_id and rp.user_id = v_uid),
    'أنت مش في الغرفة.');

  select mode into v_mode from public.rooms where id = p_room_id;
  perform public.assert_true(v_mode = 'hebd', 'الغرفة دي مش مود هيبد.');

  select * into v_match from public.hebd_matches where room_id = p_room_id;
  perform public.assert_true(v_match.status = 'playing', 'الماتش مش شغال.');

  -- Authoritative lock: use vs use / use vs question / use vs guess.
  select * into r from public.hebd_rounds
   where id = v_match.current_round_id for update;
  perform public.assert_true(r.id is not null, 'مفيش جولة حالية.');
  perform public.assert_true(r.status <> 'revealed', 'الجولة دي خلصت بالفعل.');
  perform public.assert_true(r.guesser_id = v_uid,
    'الكارت الأحمر للجايسر بس في الجولة دي.');
  perform public.assert_true(r.ends_at is not null and r.ends_at > now(),
    'الوقت خلص.');

  perform public.assert_true(
    not exists (select 1 from public.hebd_card_uses cu
                 where cu.room_id = p_room_id
                   and cu.user_id = v_uid
                   and cu.card = 'red'),
    'استخدمت الكارت الأحمر بالفعل في الماتش ده.');

  -- Consume the card exactly once (PK is the hard guarantee).
  insert into public.hebd_card_uses (room_id, user_id, card, round_id)
  values (p_room_id, v_uid, 'red', r.id);

  -- Exactly 3 sequential question slots for this round.
  insert into public.hebd_red_card_questions
        (room_id, round_id, guesser_id, presenter_id, question_number)
  select p_room_id, r.id, v_uid, r.presenter_id, gs
    from generate_series(1, 3) as gs;

  return query select true, r.id, 3;
end $function$;

-- ------------------------------------------------------------
-- 6) submit_hebd_red_question — the guesser fills the next empty
--    slot. The server decides the question number; the client never
--    sends one. Strictly sequential: no new question while a previous
--    one is still unanswered (matches the 1→2→3 state machine).
-- ------------------------------------------------------------
create or replace function public.submit_hebd_red_question(p_room_id uuid, p_question text)
returns table(ok boolean, question_number integer, waiting_for_answer boolean)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_clean text := btrim(coalesce(p_question, ''));
  v_mode  text;
  v_match public.hebd_matches%rowtype;
  r       public.hebd_rounds%rowtype;
  v_slot  record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(length(v_clean) > 0, 'اكتب السؤال الأول.');
  perform public.assert_true(char_length(v_clean) <= 200,
    'السؤال طويل أوي (الحد 200 حرف).');
  perform public.assert_true(
    exists (select 1 from public.room_players rp
             where rp.room_id = p_room_id and rp.user_id = v_uid),
    'أنت مش في الغرفة.');

  select mode into v_mode from public.rooms where id = p_room_id;
  perform public.assert_true(v_mode = 'hebd', 'الغرفة دي مش مود هيبد.');

  select * into v_match from public.hebd_matches where room_id = p_room_id;
  perform public.assert_true(v_match.status = 'playing', 'الماتش مش شغال.');

  select * into r from public.hebd_rounds
   where id = v_match.current_round_id for update;
  perform public.assert_true(r.id is not null, 'مفيش جولة حالية.');
  perform public.assert_true(r.status <> 'revealed', 'الجولة دي خلصت بالفعل.');
  perform public.assert_true(r.guesser_id = v_uid,
    'الأسئلة للجايسر بس في الجولة دي.');
  perform public.assert_true(r.ends_at is not null and r.ends_at > now(),
    'الوقت خلص.');

  -- The red card must have been consumed for THIS round.
  perform public.assert_true(
    exists (select 1 from public.hebd_card_uses cu
             where cu.room_id = p_room_id
               and cu.user_id = v_uid
               and cu.card = 'red'
               and cu.round_id = r.id),
    'فوّلت الكارت الأحمر الأول.');

  -- Strictly sequential: no pending unanswered question, no 4th question.
  perform public.assert_true(
    not exists (select 1 from public.hebd_red_card_questions q
                 where q.round_id = r.id
                   and q.question is not null
                   and q.answer is null),
    'فيه سؤال لسه مستني إجابة.');


-- ------------------------------------------------------------
-- 7) answer_hebd_red_question — the presenter answers the current
--    waiting question. The server decides which question that is
--    (lowest numbered with question set and answer NULL), so the
--    client can never answer out of order or twice.
-- ------------------------------------------------------------
create or replace function public.answer_hebd_red_question(p_room_id uuid, p_answer text)
returns table(ok boolean, question_number integer, answered boolean, questions_remaining integer)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_clean     text := btrim(coalesce(p_answer, ''));
  v_mode      text;
  v_match     public.hebd_matches%rowtype;
  r           public.hebd_rounds%rowtype;
  v_slot      record;
  v_remaining integer;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(length(v_clean) > 0, 'اكتب الإجابة الأول.');
  perform public.assert_true(char_length(v_clean) <= 200,
    'الإجابة طويلة أوي (الحد 200 حرف).');
  perform public.assert_true(
    exists (select 1 from public.room_players rp
             where rp.room_id = p_room_id and rp.user_id = v_uid),
    'أنت مش في الغرفة.');

  select mode into v_mode from public.rooms where id = p_room_id;
  perform public.assert_true(v_mode = 'hebd', 'الغرفة دي مش مود هيبد.');

  select * into v_match from public.hebd_matches where room_id = p_room_id;
  perform public.assert_true(v_match.status = 'playing', 'الماتش مش شغال.');

  select * into r from public.hebd_rounds
   where id = v_match.current_round_id for update;
  perform public.assert_true(r.id is not null, 'مفيش جولة حالية.');
  perform public.assert_true(r.status <> 'revealed', 'الجولة دي خلصت بالفعل.');
  perform public.assert_true(r.presenter_id = v_uid,
    'الإجابات لللي بيقدم بس في الجولة دي.');
  perform public.assert_true(r.ends_at is not null and r.ends_at > now(),
    'الوقت خلص.');

  -- The round's guesser must have activated the red card this round.
  perform public.assert_true(
    exists (select 1 from public.hebd_card_uses cu
             where cu.room_id = p_room_id
               and cu.user_id = r.guesser_id
               and cu.card = 'red'
               and cu.round_id = r.id),
    'الكارت الأحمر مش مفوّل في الجولة دي.');

  -- Exactly one waiting question; answer the lowest-numbered one only.
  select * into v_slot from public.hebd_red_card_questions
   where round_id = r.id
     and question is not null
     and answer is null
   order by question_number
   limit 1;
  perform public.assert_true(v_slot.id is not null,
    'مفيش سؤال مستني إجابة دلوقتي.');

  update public.hebd_red_card_questions
     set answer = v_clean,
         answered_at = now()
   where id = v_slot.id;

  select count(*) into v_remaining
    from public.hebd_red_card_questions
   where round_id = r.id and question is null;

  return query select true, v_slot.question_number, true, v_remaining::integer;
end $function$;

-- ------------------------------------------------------------
-- 8) use_hebd_green_card — the guesser spends their 🟢 to ask the
--    presenter for a hint. The request row is created here; the hint
--    TEXT comes only from the presenter later (never generated from
--    the secret — this RPC does not even read hebd_item_secrets).
-- ------------------------------------------------------------
create or replace function public.use_hebd_green_card(p_room_id uuid)
returns table(ok boolean, round_id uuid)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_mode  text;
  v_match public.hebd_matches%rowtype;
  r       public.hebd_rounds%rowtype;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(
    exists (select 1 from public.room_players rp
             where rp.room_id = p_room_id and rp.user_id = v_uid),
    'أنت مش في الغرفة.');

  select mode into v_mode from public.rooms where id = p_room_id;
  perform public.assert_true(v_mode = 'hebd', 'الغرفة دي مش مود هيبد.');

  select * into v_match from public.hebd_matches where room_id = p_room_id;
  perform public.assert_true(v_match.status = 'playing', 'الماتش مش شغال.');

  select * into r from public.hebd_rounds
   where id = v_match.current_round_id for update;
  perform public.assert_true(r.id is not null, 'مفيش جولة حالية.');
  perform public.assert_true(r.status <> 'revealed', 'الجولة دي خلصت بالفعل.');
  perform public.assert_true(r.guesser_id = v_uid,
    'الكارت الأخضر للجايسر بس في الجولة دي.');
  perform public.assert_true(r.ends_at is not null and r.ends_at > now(),
    'الوقت خلص.');

  perform public.assert_true(
    not exists (select 1 from public.hebd_card_uses cu
                 where cu.room_id = p_room_id
                   and cu.user_id = v_uid
                   and cu.card = 'green'),
    'استخدمت الكارت الأخضر بالفعل في الماتش ده.');

  -- Consume exactly once (PK guarantee) + create the hint request
  -- (UNIQUE(round_id) backs this up at the storage level too).
  insert into public.hebd_card_uses (room_id, user_id, card, round_id)
  values (p_room_id, v_uid, 'green', r.id);

  insert into public.hebd_green_card_hints
        (room_id, round_id, requester_id, provider_id)
  values (p_room_id, r.id, v_uid, r.presenter_id);

  return query select true, r.id;
end $function$;

-- ------------------------------------------------------------
-- 9) provide_hebd_green_hint — the presenter authors the hint text.
--    Exactly one hint per request; provided_at marks completion.
--    The server never validates hint accuracy and never reads the
--    secret.
-- ------------------------------------------------------------
create or replace function public.provide_hebd_green_hint(p_room_id uuid, p_hint text)
returns table(ok boolean, provided boolean)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_clean text := btrim(coalesce(p_hint, ''));
  v_mode  text;
  v_match public.hebd_matches%rowtype;
  r       public.hebd_rounds%rowtype;
  v_hint  record;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(length(v_clean) > 0, 'اكتب التلميح الأول.');
  perform public.assert_true(char_length(v_clean) <= 200,
    'التلميح طويل أوي (الحد 200 حرف).');
  perform public.assert_true(
    exists (select 1 from public.room_players rp
             where rp.room_id = p_room_id and rp.user_id = v_uid),
    'أنت مش في الغرفة.');

  select mode into v_mode from public.rooms where id = p_room_id;
  perform public.assert_true(v_mode = 'hebd', 'الغرفة دي مش مود هيبد.');

  select * into v_match from public.hebd_matches where room_id = p_room_id;
  perform public.assert_true(v_match.status = 'playing', 'الماتش مش شغال.');

  select * into r from public.hebd_rounds
   where id = v_match.current_round_id for update;
  perform public.assert_true(r.id is not null, 'مفيش جولة حالية.');
  perform public.assert_true(r.status <> 'revealed', 'الجولة دي خلصت بالفعل.');
  perform public.assert_true(r.presenter_id = v_uid,
    'التلميح من اللي بيقدم بس في الجولة دي.');
  perform public.assert_true(r.ends_at is not null and r.ends_at > now(),
    'الوقت خلص.');

  -- The round's guesser must have spent the green card this round.
  perform public.assert_true(
    exists (select 1 from public.hebd_card_uses cu
             where cu.room_id = p_room_id
               and cu.user_id = r.guesser_id
               and cu.card = 'green'
               and cu.round_id = r.id),
    'الكارت الأخضر مش مفوّل في الجولة دي.');

  select * into v_hint from public.hebd_green_card_hints
   where round_id = r.id and hint is null
   limit 1;
  perform public.assert_true(v_hint.id is not null,
    'مفيش طلب تلميح مستني، أو التلميح اتقدم بالفعل.');

  update public.hebd_green_card_hints
     set hint = v_clean,
         provided_at = now()
   where id = v_hint.id;

  return query select true, true;
end $function$;

-- ------------------------------------------------------------
-- 10) Permissions — card RPCs are executable by authenticated ONLY.
--     No new internals; existing Phase 3A helper revokes unchanged.
-- ------------------------------------------------------------
grant execute on function public.use_hebd_red_card(uuid) to authenticated;
grant execute on function public.submit_hebd_red_question(uuid, text) to authenticated;
grant execute on function public.answer_hebd_red_question(uuid, text) to authenticated;
grant execute on function public.use_hebd_green_card(uuid) to authenticated;
grant execute on function public.provide_hebd_green_hint(uuid, text) to authenticated;

revoke execute on function public.use_hebd_red_card(uuid) from public, anon;
revoke execute on function public.submit_hebd_red_question(uuid, text) from public, anon;
revoke execute on function public.answer_hebd_red_question(uuid, text) from public, anon;
revoke execute on function public.use_hebd_green_card(uuid) from public, anon;
revoke execute on function public.provide_hebd_green_hint(uuid, text) from public, anon;


