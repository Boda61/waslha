-- ============================================================
-- Waslha — Difficulty-based scoring + harder challenges
--   1) difficulty_points(text) -> سهل 50 / متوسط 75 / صعب 100
--   2) submit_answer awards the points of the challenge's
--      difficulty (instead of a flat 100).
--   3) Reclassify a curated set of existing challenges as 'متوسط'.
--   4) Add 40 genuinely harder challenges (c301..c340) with
--      confusable image pairs and close/distracting choices, each
--      with its own secret (correct index varied, 0..3).
-- Idempotent: safe to re-run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) difficulty_points — single source of truth for per-difficulty
--    points. Internal helper (not exposed to the Data API).
-- ------------------------------------------------------------------
create or replace function public.difficulty_points(p_difficulty text)
returns int language sql immutable as $$
  select case coalesce(p_difficulty, '')
    when 'سهل'   then 50
    when 'متوسط' then 75
    when 'صعب'   then 100
    else 50
  end
$$;
revoke execute on function public.difficulty_points(text) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 2) submit_answer — award difficulty-based points on a correct answer.
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

  select status, round_id, leader_id, mode into room_rec
    from public.rooms where id = p_room_id;
  perform public.assert_true(room_rec.status is not null, 'مفيش غرفة.');
  perform public.assert_true(room_rec.status = 'playing', 'اللعبة مش شغالة.');
  perform public.assert_true(room_rec.round_id = p_round_id, 'دي مش الجولة الحالية.');

  -- Race-condition protection: every answer serializes on the round row.
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
  if room_rec.mode = 'solo' then
    perform public.assert_true(player_rec.team is null,
      'المود ده مفيش فيه فرق — اللاعب اللي له تيم مش مفروض يكون موجود.');
  else
    perform public.assert_true(player_rec.team in ('red','blue'), 'لازم تختار فريق الأول.');
  end if;
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

  -- Record the attempt. The (round_id, user_id) PK stops repeats; in teams
  -- mode the (round_id, team, choice_index) unique index stops a team from
  -- repeating an already-tried choice. In solo mode team is NULL, so the
  -- unique index treats every row as distinct — each player answers once.
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
    -- Points come from the challenge's difficulty (سهل 50 / متوسط 75 / صعب 100).
    v_score_delta := public.difficulty_points(
      (select difficulty from public.challenges where id = round_rec.challenge_id)
    );
    update public.rounds
       set status = 'revealed',
           winning_team = case when room_rec.mode = 'solo' then null else player_rec.team end,
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

    -- teams: add the points to the winning team's score too.
    if room_rec.mode <> 'solo' then
      if player_rec.team = 'red' then
        update public.rooms set red_score = red_score + v_score_delta where id = p_room_id;
      else
        update public.rooms set blue_score = blue_score + v_score_delta where id = p_room_id;
      end if;
    end if;

    update public.room_players set score = score + v_score_delta, online = true
     where room_id = p_room_id and user_id = v_uid;
  end if;

  return jsonb_build_object(
    'correct',        v_correct,
    'round_revealed', v_correct,
    'winning_team',   case when v_correct and room_rec.mode <> 'solo' then player_rec.team else null end,
    'winning_user_id', case when v_correct then v_uid else null end,
    'correct_index',  case when v_correct then v_secret else null end,
    'score_delta',    v_score_delta
  );
end $$;

-- ------------------------------------------------------------------
-- 3) Reclassify existing challenges: pick the ones that already need
--    a bit of inference or have close/confusable images and choices,
--    and promote them from 'سهل' to 'متوسط'.
-- ------------------------------------------------------------------
update public.challenges
   set difficulty = 'متوسط'
 where id in (
  'c06','c07','c08','c09','c11',
  'c76','c85','c87','c95','c101','c127','c134','c142','c146',
  'c154','c158','c165','c166','c189','c190','c198','c203','c204',
  'c216','c217','c221','c222','c227','c233','c236','c237','c240',
  'c247','c248','c250','c264','c279','c281','c284','c296','c298'
 );

-- ------------------------------------------------------------------
-- 4) New HARD challenges — confusable pairs + close choices.
--    The correct choice position varies (0..3) on purpose.
-- ------------------------------------------------------------------
insert into public.challenges
  (id, title, image_a_emoji, image_a_label, image_b_emoji, image_b_label,
   choices, category, difficulty, active)
values
('c301','ثدييات غريبة','🦇','خفاش','🐬','دولفين','["طيور","أسماك","ثدييات","زواحف"]','حيوانات','صعب',true),
('c302','طيور','🐧','بطريق','🦅','نسر','["أسماك","طيور","ثدييات","حشرات"]','حيوانات','صعب',true),
('c303','أبقار','🐄','بقرة','🦬','جاموس أمريكي','["أغنام","أبقار","غزلان","خيول"]','حيوانات','صعب',true),
('c304','حاجات شائكة','🦔','قنفذ','🌵','صبار','["حيوانات أليفة","نباتات ناعمة","أشياء شائكة","أشياء مطاطية"]','حيوانات','صعب',true),
('c305','مأكولات بحرية','🐙','أخطبوط','🦐','جمبري','["لحوم","مأكولات بحرية","دواجن","مخبوزات"]','أكل','صعب',true),
('c306','حيوانات بدم بارد','🐸','ضفدع','🦎','سحلية','["ثدييات","طيور","حشرات","حيوانات بدم بارد"]','حيوانات','صعب',true),
('c307','حشرات طايرة','🐝','نحلة','🦟','بعوضة','["طيور صغيرة","حشرات طايرة","خنافس","عناكب"]','حيوانات','صعب',true),
('c308','إكسسوارات شتوية','🧦','شراب','🧤','جانتيات','["ملابس داخلية","أدوات رياضية","إكسسوارات شتوية","أدوات مطبخ"]','ملابس','صعب',true),
('c309','أدوات أمان','🔑','مفتاح','🔒','قفل','["أدوات مكتب","أدوات أمان","أدوات حديقة","أدوات مطبخ"]','أشياء يومية','صعب',true),
('c310','أدوات مغناطيسية','🧲','مغناطيس','🧭','بوصلة','["أدوات كهربائية","أدوات قياس","أدوات مغناطيسية","أدوات بناء"]','أدوات','صعب',true),
('c311','حالات المياه','💧','ماء','🧊','ثلج','["مشروبات","عصائر","حلويات","حالات للمياه"]','طبيعة','صعب',true),
('c312','بطاطس','🥔','بطاطس','🍟','بطاطس مقلية','["نشويات تانية","خضار ورقية","فواكه","بطاطس"]','أكل','صعب',true),
('c313','حاجات العسل','🍯','عسل','🐝','نحلة','["فواكه","حاجات مرتبطة بالعسل","مشروبات","حلويات مصنعة"]','أكل','صعب',true),
('c314','منتجات ألبان','🥛','لبن','🧀','جبنة','["منتجات ألبان","عصائر","لحوم","مكسرات"]','أكل','صعب',true),
('c315','العيلة البصلية','🧅','بصل','🧄','ثوم','["بهارات","فواكه","أعشاب","خضروات من نفس العيلة"]','أكل','صعب',true),
('c316','ورود','🌹','وردة','🥀','وردة ذابلة','["نباتات شائكة","أزهار تانية","فواكه","ورود"]','طبيعة','صعب',true),
('c317','خيليات','🐎','حصان','🦓','حمار وحشي','["خيليات","أبقار","غزلان","كلاب"]','حيوانات','صعب',true),
('c318','قطط برية','🐆','فهد','🐯','نمر','["كلاب برية","قطط برية","دببة","قوارض"]','حيوانات','صعب',true),
('c319','كائنات بحرية','🦈','قرش','🐬','دولفين','["طيور بحرية","أسماك نهرية","كائنات بحرية","ثدييات برية"]','حيوانات','صعب',true),
('c320','حاجات بتطير','🚁','هليكوبتر','🛸','طبق طائر','["سفن","حاجات بتطير","عربات","قطارات"]','مواصلات','صعب',true),
('c321','آلات وترية','🎸','جيتار','🎻','كمان','["آلات نفخ","آلات إيقاع","آلات وترية","أدوات صوت"]','ترفيه','صعب',true),
('c322','آلات نفخ','🎺','ترومبيت','🎷','ساكسفون','["آلات نفخ","آلات وترية","آلات إيقاع","أدوات حديد"]','ترفيه','صعب',true),
('c323','قشريات','🦐','جمبري','🦞','استاكوزا','["قشريات","رخويات","أسماك","برمائيات"]','أكل','صعب',true),
('c324','حاجات ليها 8 أرجل','🕷️','عنكبوت','🦂','عقرب','["حشرات","طيور","قوارض","حاجات ليها 8 أرجل"]','حيوانات','صعب',true),
('c325','حشرات اجتماعية','🐜','نملة','🐝','نحلة','["طيور","حشرات اجتماعية","قوارض","أسماك"]','حيوانات','صعب',true),
('c326','حيوانات ليلية','🦉','بومة','🐱','قطة','["حيوانات نهارية","حيوانات أليفة","حيوانات ليلية","طيور نهارية"]','حيوانات','صعب',true),
('c327','حاجات باردة','🧊','مكعب ثلج','❄️','ندفة','["طقس صيفي","مشروبات ساخنة","حاجات باردة","حلويات"]','طبيعة','صعب',true),
('c328','ظواهر دوارة','🌪️','إعصار','🌀','زوبعة','["ظواهر جوية دوارة","ظواهر جوية هادئة","أمور بحرية","ظواهر أرضية"]','طبيعة','صعب',true),
('c329','مواد بناء','🧱','طوب','🪨','حجر','["أدوات مطبخ","أدوات مكتب","مواد بناء","أدوات حديقة"]','أشياء يومية','صعب',true),
('c330','أدوات بصرية','🔭','تليسكوب','🔬','ميكروسكوب','["أجهزة تصوير","أدوات علمية للرؤية","أجهزة صوت","أدوات مطبخ"]','تكنولوجيا','صعب',true),
('c331','شفاف ولامع','💎','ألماس','🥶','وجه بارد','["حلويات","مشروبات","حاجات شفافة لامعة","أدوات شخصية"]','أشياء يومية','صعب',true),
('c332','منتجات ألبان','🧀','جبنة','🧈','زبدة','["زيوت","منتجات ألبان","لحوم","بيض"]','أكل','صعب',true),
('c333','حاجات ليها قوقعة','🐢','سلحفاة','🐌','حلزون','["زواحف","حشرات","أسماك","حاجات ليها قوقعة"]','حيوانات','صعب',true),
('c334','حاجات كروية','⚽','كورة','🌍','كرة أرضية','["ألعاب","أدوات مدرسية","أشياء مسطحة","حاجات كروية"]','ترفيه','صعب',true),
('c335','حبوب','🍚','أرز','🌾','قمح','["بقوليات","حبوب","مكسرات","بذور"]','أكل','صعب',true),
('c336','عناية بالأسنان','🦷','سن','🪥','فرشاة أسنان','["أدوات مطبخ","أدوات تجميل","حاجات للعناية بالأسنان","أدوات مكتب"]','أشياء يومية','صعب',true),
('c337','حاجات للرؤية','👁️','عين','🔭','تليسكوب','["أجهزة تصوير","أجهزة صوت","أدوات مكتب","حاجات للرؤية"]','تكنولوجيا','صعب',true),
('c338','ألعاب بتطير','🪁','طيارة ورق','🎈','بالون','["ألعاب أرضية","أدوات مكتب","أدوات مطبخ","ألعاب بتطير"]','ترفيه','صعب',true),
('c339','أحذية','🥾','جزمة','👢','بوت','["قبعات","نظارات","أحذية","ملابس"]','ملابس','صعب',true),
('c340','حاجات النار','🧯','طفاية حريق','🔥','نار','["أدوات مطبخ","أدوات حديقة","أدوات بناء","حاجات بتتعلق بالنار"]','أشياء يومية','صعب',true)
on conflict (id) do nothing;

-- Secrets for the new hard challenges (varied correct positions 0..3).
insert into public.challenge_secrets (challenge_id, correct_index) values
('c301',2),('c302',1),('c303',1),('c304',2),('c305',1),('c306',3),('c307',1),('c308',2),
('c309',1),('c310',2),('c311',3),('c312',3),('c313',1),('c314',0),('c315',3),('c316',3),
('c317',0),('c318',1),('c319',2),('c320',1),('c321',2),('c322',0),('c323',0),('c324',3),
('c325',1),('c326',2),('c327',2),('c328',0),('c329',2),('c330',1),('c331',2),('c332',1),
('c333',3),('c334',3),('c335',1),('c336',2),('c337',3),('c338',3),('c339',2),('c340',3)
on conflict (challenge_id) do nothing;