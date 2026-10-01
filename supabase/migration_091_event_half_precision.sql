-- Hatzze — 마이그레이션 091: 일정 정밀도에 '반기(half)'를 더한다
--
-- 채널 글의 '하반기 양산'·'상반기 중 출시'를 지금까지는 분기(quarter)로 적었다 — 하반기면 7월 1일
-- quarter. 그러면 기간 끝이 9월 30일이라
--   · 10월 이후에 올라온 '하반기' 일정은 파이프라인이 '지난 일'로 버렸고(extract_telegram_events.date_ok),
--   · 7~9월에 올라온 것도 10월 1일이 되면 화면 '다가오는 일정'에서 사라졌고(lib/event-period.ts),
--   · 화면 라벨은 '하반기'가 아니라 '3분기'였다.
-- 4분기에 가장 많이 나오는 '하반기 중' 류 일정이 통째로 빠지던 것이다(2026-10-01 점검 pipeline-telegram#4).
--
-- half 는 기간 첫날(상반기 1월 1일 · 하반기 7월 1일)로 적고, 끝은 6월 30일 · 12월 31일이다.
--
-- ⚠️ 이 마이그레이션 전에 파이프라인이 half 를 쓰면 검사(23514)에 걸린다. extract_telegram_events.py 가
--    그때 half 를 그 반기의 남은 분기로 바꿔 다시 쓰므로 일정이 버려지지는 않는다(예전처럼 'N분기'로 남는다).
-- ⚠️ 운영 DB 에서 손으로 고친 제약의 이름이 다르면 아래 add 가 제약을 하나 더 만든다 — 그러면 옛 제약이
--    half 를 계속 막는다. 실행 전후에 확인하려면:
--      select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid in ('public.telegram_stock_event'::regclass, 'public.telegram_us_stock_event'::regclass)
--        and contype = 'c';
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.telegram_stock_event drop constraint if exists telegram_stock_event_date_precision_check;
alter table public.telegram_stock_event
  add constraint telegram_stock_event_date_precision_check
  check (date_precision in ('day', 'month', 'quarter', 'half', 'year'));

alter table public.telegram_us_stock_event drop constraint if exists telegram_us_stock_event_date_precision_check;
alter table public.telegram_us_stock_event
  add constraint telegram_us_stock_event_date_precision_check
  check (date_precision in ('day', 'month', 'quarter', 'half', 'year'));

comment on column public.telegram_stock_event.date_precision is
  'day = 날짜가 적혀 있었다 · month = 달만("10월 중") · quarter = 분기 · half = 상·하반기(1월 1일·7월 1일) · year = 해만. 달력에는 day 만 올린다';
comment on column public.telegram_us_stock_event.date_precision is
  'day = 날짜가 적혀 있었다 · month = 달만 · quarter = 분기 · half = 상·하반기(1월 1일·7월 1일) · year = 해만. 달력에는 day 만 올린다';
