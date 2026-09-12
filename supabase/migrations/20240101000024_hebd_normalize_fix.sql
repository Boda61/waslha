-- ============================================================
-- Waslha — Hebd Mode — Fix: fn_hebd_normalize rebuild
-- The Phase 3A migration shipped a monolithic translate()
-- whose from/to literals were misaligned on multibyte Arabic.
-- This replace uses small, independently verifiable steps:
--   * letters via regexp_replace alternations (multibyte-safe)
--   * Arabic/Persian digits via a simple translate()
--   * tatweel/diacritics/ZWNJ/ZWJ via removal translate()
--   * whitespace collapse + trim
-- Deterministic, pure, security definer. Same signature —
-- just a CREATE OR REPLACE. Privilege re-revoked below.
-- ============================================================

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
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    lower(coalesce(p_input, '')),
                    '(أ|إ|آ|ٱ)', 'ا', 'g'),
                  '(ؤ)', 'و', 'g'),
                '(ئ|ى)', 'ي', 'g'),
              '(ة)', 'ه', 'g'),
            -- Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> latin
            '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
            '01234567890123456789'
          ),
          -- remove tatweel + common diacritics + zero-width chars
          'ـًٌَُِّْٰ' || chr(8204) || chr(8205),
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

revoke execute on function public.fn_hebd_normalize(text) from public, anon, authenticated;