-- ============================================================
-- Waslha — Hebd Mode — Part 3B: Gameplay RPCs
-- Authoritative gameplay state machine for Hebd rounds:
--   * submit_hebd_guess : guesser guesses; the SERVER decides correctness
--   * expire_hebd_round : timeout reveal (idempotent, race-safe)
--   * next_hebd_round   : revealed round -> next round OR end of match
--
-- Security contract (same as Classic):
--   * SECURITY DEFINER + set search_path = public
--   * auth.uid() guards via assert_true
--   * hebd_item_secrets is read ONLY inside these trusted RPCs and is
--     NEVER returned as an RPC field, never added to RLS or Realtime
--   * hebd_rounds.answer stays NULL until reveal; after reveal it is
--     public to room members (same philosophy as Classic rounds.result)
--   * FOR UPDATE locks on the authoritative round/room rows so two
--     concurrent guesses / expirations / transitions can never both win
--
-- Score rules (MVP, deterministic):
--   * correct guess : guesser +1 (hebd_rounds.score_delta = 1)
--   * wrong guess   : +0 — round stays active, multiple guesses allowed
--   * timeout       : +0, guesser_won = false, no round winner
--
-- Match-end deterministic winner (documented tie-break order):
--   1) higher room_players.score
--   2) more rounds won (hebd_rounds.winner_user_id)
--   3) joined the room earlier (joined_at asc — stable, membership is
--      fixed once the match starts)
--   4) lower user_id (uuid — fully deterministic last resort)
-- A winner ALWAYS exists; the client can never choose or change it.
-- Profiles stats are incremented once at match end (same Classic
-- convention): games_played +1 for both players, wins +1 for the winner.
-- ============================================================

-- ------------------------------------------------------------
-- 1) submit_hebd_guess — the only way a guess enters the game.
--    Locks the round row FOR UPDATE so a guess racing a correct
--    guess or an expiration can never double-reveal or double-score.
--    The secret is compared server-side; it is never returned.
-- ------------------------------------------------------------
create or replace function public.submit_hebd_guess(p_room_id uuid, p_guess text)
returns table(ok boolean, is_correct boolean, round_id uuid, revealed boolean, score_delta integer)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid      uuid := auth.uid();
  v_clean    text := btrim(coalesce(p_guess, ''));
  v_mode     text;
  v_match    public.hebd_matches%rowtype;
  r          public.hebd_rounds%rowtype;
  v_norm     text;
  v_answer   text;
  v_norm_ans text;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(length(v_clean) > 0, 'اكتب تخمين الأول.');
  perform public.assert_true(char_length(v_clean) <= 100,
    'التخمين طويل أوي (الحد 100 حرف).');

  perform public.assert_true(
    exists (select 1 from public.room_players rp
             where rp.room_id = p_room_id and rp.user_id = v_uid),
    'أنت مش في الغرفة.');

  select mode into v_mode from public.rooms where id = p_room_id;
  perform public.assert_true(v_mode = 'hebd', 'الغرفة دي مش مود هيبد.');

  select * into v_match from public.hebd_matches where room_id = p_room_id;
  perform public.assert_true(v_match.status = 'playing', 'الماتش مش شغال.');

  -- Lock the authoritative round row: serializes guess vs guess and
  -- guess vs expire; only one transaction may ever reveal a round.
  select * into r from public.hebd_rounds
   where id = v_match.current_round_id for update;
  perform public.assert_true(r.id is not null, 'مفيش جولة حالية.');
  perform public.assert_true(r.status <> 'revealed', 'الجولة دي خلصت بالفعل.');
  perform public.assert_true(r.guesser_id = v_uid, 'مش دورك تخمّن في الجولة دي.');
  perform public.assert_true(r.ends_at is not null and r.ends_at > now(),
    'الوقت خلص.');

  -- Normalize the guess and read the secret ONLY here (owner-privileged).
  v_norm := public.fn_hebd_normalize(v_clean);
  select his.answer into v_answer
    from public.hebd_item_secrets his
   where his.item_id = r.item_id;
  perform public.assert_true(v_answer is not null, 'مفيش إجابة مسجلة للعنصر ده.');
  v_norm_ans := public.fn_hebd_normalize(v_answer);

  -- Every valid attempt is recorded (multiple guesses are allowed).
  insert into public.hebd_guesses (room_id, round_id, guesser_id, guess,
                                   normalized, is_correct)
  values (p_room_id, r.id, v_uid, v_clean, v_norm, v_norm = v_norm_ans);

  if v_norm = v_norm_ans then
    -- Reveal: the answer becomes public game state for room members.
    update public.hebd_rounds
       set status = 'revealed',
           answer = v_answer,
           guesser_won = true,
           winner_user_id = r.guesser_id,
           score_delta = 1,
           revealed_at = now()
     where id = r.id;

    -- Authoritative score: +1 for the guesser (server-computed only).
    update public.room_players
       set score = score + 1
     where room_id = p_room_id and user_id = r.guesser_id;

    return query select true, true, r.id, true, 1;
    return;
  end if;

  -- Wrong guess: round stays active, nothing revealed, score untouched.
  return query select true, false, r.id, false, 0;
end $function$;


-- ------------------------------------------------------------
-- 2) expire_hebd_round — timeout reveal for the current round.
--    * Idempotent: if the round is already revealed it reports the
--      existing state and changes NOTHING (safe to call repeatedly).
--    * Server-authoritative: rejects while now() < ends_at.
--    * Reads the secret internally and writes it into the round row
--      only at reveal time; it is never returned as a field.
-- ------------------------------------------------------------
create or replace function public.expire_hebd_round(p_room_id uuid)
returns table(ok boolean, revealed boolean, guesser_won boolean)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_mode   text;
  v_match  public.hebd_matches%rowtype;
  r        public.hebd_rounds%rowtype;
  v_answer text;
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

  -- Lock the round row: guess vs expire and expire vs expire serialize.
  select * into r from public.hebd_rounds
   where id = v_match.current_round_id for update;
  perform public.assert_true(r.id is not null, 'مفيش جولة حالية.');

  -- Idempotent: nothing to do, just report the settled state.
  if r.status = 'revealed' then
    return query select true, true, coalesce(r.guesser_won, false);
    return;
  end if;

  perform public.assert_true(r.ends_at is not null and r.ends_at <= now(),
    'الوقت لسه شغال.');

  select his.answer into v_answer
    from public.hebd_item_secrets his
   where his.item_id = r.item_id;
  perform public.assert_true(v_answer is not null, 'مفيش إجابة مسجلة للعنصر ده.');

  -- Timeout: no winner, no points; the answer is revealed publicly.
  update public.hebd_rounds
     set status = 'revealed',
         answer = v_answer,
         guesser_won = false,
         winner_user_id = null,
         score_delta = 0,
         revealed_at = now()
   where id = r.id;

  return query select true, true, false;
end $function$;


-- ------------------------------------------------------------
-- 3) next_hebd_round — authoritative transition from a revealed
--    round to the next round, or to the end of the match.
--    * Locks the room row FOR UPDATE (serializes next vs next and
--      next vs end) and the round row FOR UPDATE.
--    * Requires status='revealed' — an active round can never be
--      skipped by a client.
--    * Idempotent no-op when the match is already ended.
--    * Final round: computes the winner from authoritative state
--      (documented tie-break order in the file header) and ends
--      both hebd_matches and rooms atomically.
-- ------------------------------------------------------------
create or replace function public.next_hebd_round(p_room_id uuid)
returns table(ok boolean, ended boolean)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_uid         uuid := auth.uid();
  room_rec      record;
  v_match       public.hebd_matches%rowtype;
  r             public.hebd_rounds%rowtype;
  best          record;
  rec_user      record;
  v_winner_id   uuid;
  v_winner_name text;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  perform public.assert_true(
    exists (select 1 from public.room_players rp
             where rp.room_id = p_room_id and rp.user_id = v_uid),
    'أنت مش في الغرفة.');

  -- Lock the room row first: duplicate/concurrent transitions
  -- (next vs next, next vs a state-changing RPC) serialize here.
  select * into room_rec from public.rooms where id = p_room_id for update;
  perform public.assert_true(room_rec.id is not null, 'مفيش غرفة.');
  perform public.assert_true(room_rec.mode = 'hebd', 'الغرفة دي مش مود هيبد.');

  -- Idempotent no-op: the match already ended.
  if room_rec.status = 'ended' then
    return query select true, true;
    return;
  end if;
  perform public.assert_true(room_rec.status = 'playing', 'اللعبة مش شغالة.');

  select * into v_match from public.hebd_matches where room_id = p_room_id;
  perform public.assert_true(v_match.status = 'playing', 'الماتش مش شغال.');
  perform public.assert_true(v_match.current_round_id is not null,
    'مفيش جولة حالية.');

  select * into r from public.hebd_rounds
   where id = v_match.current_round_id for update;
  perform public.assert_true(r.id is not null, 'مفيش جولة حالية.');
  perform public.assert_true(r.status = 'revealed',
    'الجولة لسه شغالة — متقدرش تتخطاها.');

  -- More rounds remain: create exactly one new round. The Phase 3A
  -- create_hebd_round keeps full responsibility for item picking,
  -- presenter/guesser rotation and the 5-minute deadline.
  if v_match.current_round < v_match.total_rounds then
    perform public.create_hebd_round(p_room_id, v_match.current_round + 1);
    return query select true, false;
    return;
  end if;

  -- Final round -> end the match from authoritative DB state only.
  -- Deterministic winner (documented): score desc -> round wins desc
  -- -> joined_at asc -> user_id asc.
  select rp.user_id, rp.username, rp.score,
         (select count(*) from public.hebd_rounds hr
           where hr.room_id = p_room_id and hr.winner_user_id = rp.user_id) as round_wins
    into best
    from public.room_players rp
   where rp.room_id = p_room_id
   order by rp.score desc,
            (select count(*) from public.hebd_rounds hr
              where hr.room_id = p_room_id and hr.winner_user_id = rp.user_id) desc,
            rp.joined_at asc,
            rp.user_id asc
   limit 1;
  perform public.assert_true(best.user_id is not null, 'مفيش لاعبين في الماتش.');

  -- The ORDER BY above is the full documented tie-break chain:
  -- score desc -> round wins desc -> earlier joiner -> lower uuid.
  -- A winner ALWAYS exists; the client can never choose or change it.
  v_winner_id := best.user_id;

  select username into v_winner_name
    from public.room_players
   where room_id = p_room_id and user_id = v_winner_id;

  update public.hebd_matches
     set status = 'ended',
         winner_user_id = v_winner_id,
         winner_name = v_winner_name,
         updated_at = now()
   where room_id = p_room_id;

  update public.rooms
     set status = 'ended'
   where id = p_room_id;

  -- Profiles stats, exactly once per match end (Classic convention).
  for rec_user in
    select rp.user_id from public.room_players rp where rp.room_id = p_room_id
  loop
    update public.profiles
       set games_played = games_played + 1,
           wins = wins + case
                    when rec_user.user_id = v_winner_id then 1 else 0 end
     where id = rec_user.user_id;
  end loop;

  return query select true, true;
end $function$;

-- ------------------------------------------------------------
-- 4) Permissions — the three gameplay RPCs are executable by
--    authenticated ONLY. No new internals were introduced; the
--    existing internal helpers (create_hebd_round, fn_hebd_normalize)
--    keep their Phase 3A revokes.
-- ------------------------------------------------------------
grant execute on function public.submit_hebd_guess(uuid, text) to authenticated;
grant execute on function public.expire_hebd_round(uuid) to authenticated;
grant execute on function public.next_hebd_round(uuid) to authenticated;

revoke execute on function public.submit_hebd_guess(uuid, text) from public, anon;
revoke execute on function public.expire_hebd_round(uuid) from public, anon;
revoke execute on function public.next_hebd_round(uuid) from public, anon;
