-- ============================================================
-- Waslha — Smart challenge selection (REPLACE ONLY, no deletes)
-- Rewrites public.pick_challenge(p_room_id uuid) so that picking
-- is still server-authoritative and random, but now also:
--   1. NEVER returns a challenge already used in this room.
--   2. NEVER returns a challenge whose normalized image pair was
--      already used in this room (defense in depth on top of the
--      global challenges_pair_uniq unique index).
--   3. Avoids repeating the same category as the last round when
--      a different category is available.
--   4. Distributes picks across categories: least-used categories
--      in the room are preferred (ties broken by random()).
--   5. Falls back to ANY unused challenge (same category ok) when
--      no different category is available — the no-repeat rules
--      are never relaxed.
--   6. Returns zero rows when nothing is available; create_round
--      turns that into a clear Arabic error.
-- Room row-lock / race protection lives in create_round (unchanged).
-- ============================================================

create or replace function public.pick_challenge(p_room_id uuid)
returns table(id text, title text, image_a_emoji text, image_a_label text,
              image_b_emoji text, image_b_label text, choices jsonb,
              category text, difficulty text)
language sql
security definer
set search_path to 'public'
as $function$
  with cat_usage as (
    select c3.category, count(*) as used
    from public.rounds r3
    join public.challenges c3 on c3.id = r3.challenge_id
    where r3.room_id = p_room_id
    group by c3.category
  )
  select c.id, c.title, c.image_a_emoji, c.image_a_label,
         c.image_b_emoji, c.image_b_label, c.choices, c.category, c.difficulty
  from public.challenges c
  left join cat_usage u on u.category = c.category
  where c.active
    and not exists (
      select 1 from public.rounds r
      where r.room_id = p_room_id and r.challenge_id = c.id
    )
    and not exists (
      select 1
      from public.rounds r2
      join public.challenges c2 on c2.id = r2.challenge_id
      where r2.room_id = p_room_id
        and least(c.image_a_emoji, c.image_b_emoji) = least(c2.image_a_emoji, c2.image_b_emoji)
        and greatest(c.image_a_emoji, c.image_b_emoji) = greatest(c2.image_a_emoji, c2.image_b_emoji)
    )
  order by
    -- Avoid repeating the last round's category when possible.
    ((select c3.category
        from public.rounds r3
        join public.challenges c3 on c3.id = r3.challenge_id
       where r3.room_id = p_room_id
       order by r3.round_number desc
       limit 1) = c.category),
    -- Distribute: prefer categories least used so far in the room.
    coalesce(u.used, 0),
    random()
  limit 1;
$function$;