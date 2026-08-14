-- These functions are internal to the game logic. They are invoked only by
-- security-definer RPCs (start_game / next_round / expire_round / create_round),
-- which run as the function owner and therefore do NOT need PUBLIC execute.
-- Blocking the REST API prevents any caller from creating rounds or reading
-- pick order outside the approved game flow.
revoke execute on function public.create_round(uuid, int, text) from public, anon, authenticated;
revoke execute on function public.pick_challenge(uuid) from public, anon, authenticated;
revoke execute on function public.pick_challenge() from public, anon, authenticated;
revoke execute on function public.seed_challenges() from public, anon, authenticated;