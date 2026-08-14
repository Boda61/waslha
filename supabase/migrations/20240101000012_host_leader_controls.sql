-- Host controls for the lobby:
-- 1. set_team_leader: host picks who leads the opposite team (clears the
--    auto-assigned leader of that team).
-- 2. transfer_host: the room creator hands host to another room member.

create or replace function public.set_team_leader(p_room_id uuid, p_target_user_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid  uuid := auth.uid();
  target public.room_players%rowtype;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');

  if exists (select 1 from public.rooms r where r.id = p_room_id and r.host_id = v_uid) = false then
    perform public.assert_true(false, 'انت مش صاحب الغرفة.');
  end if;

  if exists (select 1 from public.rooms r where r.id = p_room_id and r.status = 'lobby') = false then
    perform public.assert_true(false, 'مفيش تغيير قائد بعد ما اللعبة بدأت.');
  end if;

  select * into target from public.room_players
   where room_id = p_room_id and user_id = p_target_user_id;
  perform public.assert_true(target.user_id is not null, 'اللاعب ده مش في الغرفة.');
  perform public.assert_true(target.team is not null, 'اللاعب ده لسه مفيش فريق.');

  update public.room_players
     set is_leader = (user_id = target.user_id)
   where room_id = p_room_id and team = target.team;

  return query select true;
end $$;

create or replace function public.transfer_host(p_room_id uuid, p_new_host_id uuid)
returns table(ok boolean) language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid();
  room  public.rooms%rowtype;
begin
  perform public.assert_true(v_uid is not null, 'لازم تسجل دخول الأول.');
  select * into room from public.rooms where id = p_room_id;
  perform public.assert_true(room.id is not null, 'مفيش غرفة.');
  perform public.assert_true(room.host_id = v_uid, 'انت مش صاحب الغرفة.');
  perform public.assert_true(p_new_host_id is not null, 'اختر اللاعب الجديد.');

  if not exists (select 1 from public.room_players
                  where room_id = p_room_id and user_id = p_new_host_id) then
    perform public.assert_true(false, 'اللاعب ده مش في الغرفة.');
  end if;

  update public.rooms set host_id = p_new_host_id where id = p_room_id;

  return query select true;
end $$;

grant execute on function public.set_team_leader to authenticated;
grant execute on function public.transfer_host to authenticated;