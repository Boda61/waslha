-- ============================================================
-- Waslha — Mixed difficulty selection (REPLACE ONLY, no deletes)
-- Rewrites public.pick_challenge(p_room_id uuid) so picking is a
-- real MIX of the three difficulty levels (سهل / متوسط / صعب)
-- instead of a pure random() draw that would mostly return سهل
-- (259 of the 340 challenges are easy).
--
-- The order now prefers:
--   1. avoid repeating the last round's category (as before)
--   2. the difficulty level LEAST used so far in this room  <-- NEW
--   3. the category least used so far in this room
--   4. random() to break ties
--
-- So a 10-round game naturally ends up with roughly a third of
-- easy, a third of medium and a third of hard challenges, while
-- the existing no-repeat / no-duplicate-pair / active-only rules
-- stay fully intact.
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
  ),
  diff_usage as (
    select c3.difficulty, count(*) as used
    from public.rounds r3
    join public.challenges c3 on c3.id = r3.challenge_id
    where r3.room_id = p_room_id
    group by c3.difficulty
  )
  select c.id, c.title, c.image_a_emoji, c.image_a_label,
         c.image_b_emoji, c.image_b_label, c.choices, c.category, c.difficulty
  from public.challenges c
  left join cat_usage u on u.category = c.category
  left join diff_usage du on du.difficulty = c.difficulty
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
    -- NEW: mix the difficulty levels — prefer the level used LEAST in
    -- this room so a game gets a healthy mix of سهل/متوسط/صعب.
    coalesce(du.used, 0),
    -- Distribute: prefer categories least used so far in the room.
    coalesce(u.used, 0),
    random()
  limit 1;
$function$;