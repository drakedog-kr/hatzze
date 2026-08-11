-- Hatzze — 마이그레이션 037: 미국 종목의 '관심의 폭'(서로 다른 채널 수)
--
-- 국내 짝: migration_028(telegram_stock_breadth).
--
-- ## ⚠️ telegram_us_stock_daily.channel_count 로 갈음하면 안 된다
--
-- 그 열은 **그날 하루**의 채널 수다. 여러 날을 묶으면 합집합이 아니라서, 지금 화면은
-- 일별 최댓값을 쓰고 있었다(합치면 같은 채널을 며칠치 겹쳐 세니까). 그 값은 실제보다
-- 크게 작다 — 실측으로 엔비디아가 화면엔 100채널인데 창 전체로는 **228채널**이다.
-- 국내 쪽 주석이 같은 함정을 이미 적어 두었다("창을 늘려도 값이 안 커져서 '창이 길수록
-- 채널이 적은' 불가능한 조합이 나온다").
--
-- ## 왜 미리 세어 두나
--
-- 원자료(telegram_message_us_stocks 38,319행)를 렌더마다 통째로 읽어야 답이 나온다.
-- 실측 2.37초로, 지금 페이지 전체 렌더(~1초)보다 오래 걸린다. 파이프라인이 돌 때만
-- 값이 바뀌므로 그때 한 번 세어 둔다.
--
-- ## 화면 세 자리가 이 값을 쓴다
--
--   급부상 종목 · 주요 종목 리포트 의 "N개 채널"   ← 지금 틀린 값을 보여주는 자리
--   '몇 곳이 말하나' 카드 (신규)
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_us_stock_breadth (
  as_of_date date not null,
  window_days integer not null,
  ticker text not null references public.us_stocks (ticker),
  channel_count integer not null default 0,
  mention_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (as_of_date, window_days, ticker)
);

comment on table public.telegram_us_stock_breadth is
  '창 안에서 그 미국 종목을 언급한 **서로 다른** 채널 수. 국내는 telegram_stock_breadth';
comment on column public.telegram_us_stock_breadth.as_of_date is
  '창의 끝점. 화면은 이 값으로 창을 고정해 읽는다 — 읽기 시점에 창을 다시 잡으면 파이프라인과 숫자가 갈린다';
comment on column public.telegram_us_stock_breadth.channel_count is
  '⚠️ 일별 channel_count 의 합도 최댓값도 아니다. 창 전체의 **합집합**이라 창이 길수록 커진다';
comment on column public.telegram_us_stock_breadth.mention_count is
  '같은 창의 언급 수. 채널 수와 나란히 두면 "몇 곳이 몇 번 말했나"가 한 줄에서 읽힌다';

create index if not exists tg_us_stock_breadth_asof_idx
  on public.telegram_us_stock_breadth (as_of_date desc, channel_count desc);

alter table public.telegram_us_stock_breadth enable row level security;
