-- Hatzze — 마이그레이션 102: 미장 급부상 카드 창의 끝날
--
-- ## 무엇을 고치나
--
-- 미장 급부상 카드는 늘 기준일을 뺀 앞 14일(최근 3일 vs 그 앞)로 그렸다. 국장은 저녁 실행 뒤엔 그날을 넣는데(086)
-- 미장만 빼서 하루 어긋났다 — 10-15 저녁 코어위브(222회 · 5.9배)가 같은 화면 '크게 움직인 종목' 1위(-15.46%)이고
-- 테마별 급부상 2위인데 급부상 표에만 없었다(2026-10-15 점검).
--
-- 국장과 같은 판정(common/surging.window_end_for — 공용 telegram_messages 의 가장 늦은 글이 17시를 넘겼나)으로
-- 창 끝을 정하고, 미장 한 줄 요약을 만든 뒤 이 표에 적는다. 화면(lib/us-telegram-data.ts usSurgingWindow)은 읽기만 한다.
--
-- ## 칸
--
--   date        기준일(telegram_us_sentiment_daily 의 최신 날짜 = 화면의 usKaderaBaseDate)
--   window_end  급부상 창의 끝날. 기준일(저녁 실행 뒤) 또는 그 전날(아침 실행 뒤)
--   channels    저녁 창일 때 카드 종목의 관심의 폭 {티커: 서로 다른 채널 수}. 아침 창이면 null.
--               관심의 폭 표(telegram_us_stock_breadth)는 찍은 날의 전날에서 끝나는 창이라 저녁 카드 창과 갈린다.
--               이 칸이 없으면 화면은 일별 최댓값으로 물러나 채널 수가 아침보다 크게 작았다(국장은 098 이 같은 일을 풀었다).
--
-- ⚠️ 이 표가 없거나 기준일 행이 없으면 화면은 예전처럼 전날 끝 창으로 그린다. 파이프라인도 못 적으면
--    경고만 남기고 넘어간다. 그래서 코드와 이 마이그레이션의 순서는 상관없지만, 먼저 실행해 둘 것.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_us_surging_window (
  date date primary key,
  window_end date not null,
  channels jsonb,
  updated_at timestamptz not null default now(),
  check (window_end = "date" or window_end = "date" - 1)
);

comment on table public.telegram_us_surging_window is
  '미장 급부상 카드 창의 끝날. 저녁 실행 뒤엔 기준일, 아침 실행 뒤엔 그 전날. scripts/generate_surging_oneliners.py 가 적고 lib/us-telegram-data.ts usSurgingWindow 가 읽는다';
comment on column public.telegram_us_surging_window.window_end is
  '급부상 창의 끝날(그날 포함). 기준일 글이 17시를 넘겨서까지 모였으면 기준일, 아니면 전날 — 국장 telegram_surging_window 와 같은 판정';
comment on column public.telegram_us_surging_window.channels is
  '저녁 창(window_end = date)일 때 카드 종목의 관심의 폭 {티커: 채널 수} — 카드 창으로 센 값. 아침 창이면 null(관심의 폭 표를 쓴다)';

alter table public.telegram_us_surging_window enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 옆 표들과 같다.
