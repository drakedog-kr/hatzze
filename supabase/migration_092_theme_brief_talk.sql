-- Hatzze — 마이그레이션 092: 테마 상세 '말 많은 종목' 줄마다 '요즘 도는 얘기' 한 줄을 테마 요약 행에 붙인다
--
-- 테마 상세(/theme/[테마] · /theme/us/[테마])의 '말 많은 종목' 표는 셋째 칸이 '채널이 말한 이유'(등락 까닭)였다.
-- 까닭은 종목이 움직인 날에만 생겨 열 줄 중 대여섯이 비었고(2026-10-05 국장 · 미장 147줄 중 61줄만 찼다), 같은 문장이
-- 바로 아래 '등락의 이유'에 또 섰다. 그 칸을 줄마다 '요즘 도는 얘기'(LLM 20~28자)로 바꾼다.
--
--   talk  {"<종목코드 또는 티커>": "<한 줄>", …} — 화면과 같은 규칙으로 고른 말 많은 종목(최대 12)마다.
--         그 종목 이야기가 발췌에 없으면 그 키가 없다(화면은 그 칸을 비운다). 고르는 규칙은 data-pipeline/common/theme_hot.py,
--         쓰는 곳은 generate_theme_briefs.py · generate_us_theme_briefs.py.
--
-- Supabase SQL Editor에서 실행하세요. **머지 전에** 돌려야 한다 — 파이프라인이 이 열을 써 넣고 화면이 이 열을 읽어서,
-- 열이 없으면 테마 요약 저장과 화면의 요약 조회가 함께 실패한다.

alter table public.telegram_theme_brief
  add column if not exists talk jsonb;

comment on column public.telegram_theme_brief.talk is
  '말 많은 종목마다 요즘 도는 얘기 한 줄. {"<종목코드>": "<문장>"}. generate_theme_briefs.py 가 쓴다';

alter table public.telegram_us_theme_brief
  add column if not exists talk jsonb;

comment on column public.telegram_us_theme_brief.talk is
  '말 많은 종목마다 요즘 도는 얘기 한 줄. {"<티커>": "<문장>"}. generate_us_theme_briefs.py 가 쓴다';
