-- ============================================================
-- Waslha — Hebd Mode — Populate accepted_answers with alternatives
-- Adds common Arabic synonyms to accepted_answers array
-- ============================================================

-- Items related to: هاتف / موبايل / تليفون / جوال
UPDATE public.hebd_item_secrets s
SET accepted_answers = ARRAY[
  s.answer,
  'هاتف',
  'موبايل',
  'تليفون',
  'جوال'
]
FROM public.hebd_items i
WHERE s.item_id = i.id
  AND s.answer IN ('هاتف', 'موبايل', 'تليفون', 'جوال', 'هاتف محمول', 'هاتف ذكي')
  AND array_length(s.accepted_answers, 1) = 1;

-- Items related to: سيارة / العربية
UPDATE public.hebd_item_secrets s
SET accepted_answers = ARRAY[
  s.answer,
  'سيارة',
  '카로',
  'مركبة'
]
FROM public.hebd_items i
WHERE s.item_id = i.id
  AND s.answer IN ('عربية', 'سيارة', 'سيارة ذاتية القيادة')
  AND i.image_emoji = '🚗'
  AND array_length(s.accepted_answers, 1) = 1;

-- Items related to: تفاحة
UPDATE public.hebd_item_secrets s
SET accepted_answers = ARRAY[
  s.answer,
  'تفاح',
  'تفاحات'
]
FROM public.hebd_items i
WHERE s.item_id = i.id
  AND s.answer = 'تفاحة'
  AND array_length(s.accepted_answers, 1) = 1;
