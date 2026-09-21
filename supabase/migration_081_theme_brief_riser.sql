-- Hatzze — 마이그레이션 081: 테마 리포트 '갑자기 많이 언급된 종목'의 종목과 까닭을 테마 요약 행에 붙인다
--
-- 테마 목록(/theme)의 그 카드는 테마마다 앞 사흘보다 언급이 크게 늘어난 종목 하나와 까닭을 보인다.
-- 처음엔 종목은 화면이 고르고(lib/theme-page.ts) 까닭은 급부상 한 줄 요약 표에 22~30자로 넣었는데,
--   ① 고르는 규칙이 TS·Python 두 벌이라 어긋나면 까닭 없는 줄이 나가고,
--   ② 이 화면은 까닭 칸이 넓어 한 줄짜리가 아깝다("이유를 더 자세히", 2026-09-21).
-- 그래서 **파이프라인이 고르고 쓴 것**을 테마 요약 행에 jsonb 로 붙이고 화면은 읽기만 한다.
--
--   riser  {"code","name","market","recent","prior","ratio","reason"} 또는 null(그 테마에 후보가 없다)
--          recent·prior = 최근 사흘·그 앞 사흘 언급, ratio = recent/prior(prior 0 이면 null = 새로 등장),
--          reason = 채널 글에서 읽은 까닭 50~90자(LLM). 발췌가 등락률 목록뿐이면 null(화면이 "까닭을 말한 곳이 없습니다"로 적는다).
--          고르는 규칙은 data-pipeline/common/theme_risers.py.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.telegram_theme_brief
  add column if not exists riser jsonb;

comment on column public.telegram_theme_brief.riser is
  '갑자기 많이 언급된 종목 하나와 까닭. {"code","name","market","recent","prior","ratio","reason"} 또는 null. generate_theme_briefs.py 가 쓴다';
