-- Hatzze — 마이그레이션 086: 국장 급부상 카드 창의 끝날
--
-- ## 무엇을 고치나
--
-- 급부상 카드는 기준일을 뺀 앞 14일(최근 3일 vs 그 앞)로 그렸다. 기준일은 아침 실행이 세우므로
-- 저녁 실행이 그날 글을 다 모아 와도 창이 그대로여서 **저녁 화면이 하루 전 목록**이었다.
-- 2026-09-24 HLB 가 미국 허가를 받은 날 저녁 카드에 없었다(그날을 넣으면 21.5배로 1위).
--
-- 이제 저녁 실행 뒤에는 그날을 넣는다. 넣을지는 파이프라인이 정하고(common/surging.window_end_for)
-- 한 줄 요약을 다 만든 뒤 이 표에 적는다. 화면은 이 값을 읽기만 한다 — 화면이 따로 판정하면
-- 수집과 종목 집계 사이 40분쯤 그날 행이 아침치뿐인 틈에 반쪽 하루로 순위를 낸다.
--
-- ## 칸
--
--   date        기준일(telegram_sentiment_daily 의 최신 날짜 = 화면의 kaderaBaseDate)
--   window_end  급부상 창의 끝날. 기준일(저녁 실행 뒤) 또는 그 전날(아침 실행 뒤)
--
-- ⚠️ 이 표가 없거나 기준일 행이 없으면 화면은 예전처럼 전날 끝 창으로 그린다. 파이프라인도 못 적으면
--    경고만 남기고 넘어간다. 그래서 코드와 이 마이그레이션의 순서는 상관없지만, 먼저 실행해 둘 것.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_surging_window (
  date date primary key,
  window_end date not null,
  updated_at timestamptz not null default now(),
  check (window_end = "date" or window_end = "date" - 1)
);

comment on table public.telegram_surging_window is
  '국장 급부상 카드 창의 끝날. 저녁 실행 뒤엔 기준일, 아침 실행 뒤엔 그 전날. scripts/generate_surging_oneliners.py 가 적고 lib/telegram-data.ts surgingWindowEnd 가 읽는다';
comment on column public.telegram_surging_window.window_end is
  '급부상 창의 끝날(그날 포함). 기준일 글이 17시를 넘겨서까지 모였으면 기준일, 아니면 전날';

alter table public.telegram_surging_window enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 옆 표들과 같다.
