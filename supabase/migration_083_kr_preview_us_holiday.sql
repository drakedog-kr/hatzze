-- Hatzze — 마이그레이션 083: 국장 미리보기가 **미장이 쉰 밤**을 알아보게 한다
--
-- ## 무엇을 고치나
--
-- 핀허브 quote 는 미장이 쉰 다음 날에도 **마지막 세션 값**을 그대로 준다. 수집기는 그 값이
-- 새 세션인지 보지 않았고, 미국 세션 날짜도 어디에도 남기지 않았다. 그래서 노동절(2026-09-07)
-- 다음 날인 09-08(화) 아침 화면이 09-04(금) 세션의 카드 14장을 "9/8 아침 기준 · 밤사이" 로
-- 그대로 다시 보였다. 9/5·9/6·9/7 줄과 숫자 하나 다르지 않았다.
--
-- 그 카드들은 근거도 없다. 카드 수치를 낸 백테스트(data-pipeline/backtest/kr_preview_pairs.py)는
-- 두 국내 거래일 사이에 미장 세션이 없으면 그날을 건너뛴다. 그리고 카드가 말하는 개장 갭은
-- 이미 전날 개장에서 끝난 움직임이다.
--
-- 이제 그런 밤에는 종목 줄을 쓰지 않고, 그날치 한 줄에 **휴장 이름**을 남긴다. 화면이 그 이름을
-- 보고 "휴장" 으로 그린다.
--
-- ## 더하는 칸
--
--   us_session   spx_dp 가 나온 미장 세션 날짜(미 동부). 휴장한 날 화면이 "마지막 거래일" 로 쓴다.
--   us_holiday   밤사이 미장이 쉬었으면 그 이름(노동절·추수감사절…), 열렸으면 null.
--                ⚠️ 이 칸이 null 이 아니면 그날 종목 줄은 없다(수집기가 지운다).
--
-- ⚠️ 두 칸 다 null 을 허용한다. 이 마이그레이션 전에 쓰인 줄은 둘 다 비어 있고, 화면은
--    us_holiday 가 null 이면 예전처럼 그린다.
--
-- ⚠️ **코드를 배포하기 전에 먼저 실행할 것.** 수집기는 칸이 없으면 두 칸을 빼고 다시 쓰고,
--    화면도 칸이 없으면 예전 조회로 물러서므로 죽지는 않는다. 다만 그 사이에 휴장이 끼면
--    휴장 표기 없이 "조용한 밤" 문구가 뜬다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.kr_preview_day add column if not exists us_session date;
alter table public.kr_preview_day add column if not exists us_holiday text;

comment on column public.kr_preview_day.us_session is 'spx_dp 가 나온 미장 세션 날짜(미 동부). 미장이 쉰 날 화면이 "마지막 거래일" 로 쓴다';
comment on column public.kr_preview_day.us_holiday is '밤사이 미장이 쉬었으면 그 휴장 이름(노동절 등), 열렸으면 null. null 이 아니면 그날 종목 줄은 없다';
