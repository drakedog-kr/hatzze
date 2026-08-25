-- 미국 종목의 애널리스트 컨센서스 — 등급 분포 + 목표가
--
-- ## ⭐ 왜 한 곳에서만 받나
--
-- 등급은 Finnhub, 목표가는 여기서 받아 섞을 수도 있었다. 안 섞는다 — **패널이 다르면
-- 숫자가 서로 안 맞는다.** 실측(NVDA, 2026-08-22): 애널리스트 수가 Finnhub 68명,
-- S&P Global 62명이었다. 한 카드 안에서 두 숫자가 다르면 독자는 어느 쪽도 못 믿는다.
--
-- ## ⚠️⚠️ `analyst_count` 와 `target_count` 는 다른 수다
--
-- 등급을 낸 애널리스트와 목표가를 낸 애널리스트가 다르다. NVDA 는 등급 62명 · 목표가
-- 59명이었다. 하나로 합쳐 저장하면 되돌릴 수 없다.
--
-- ## ⚠️ 시점은 **우리가 찍는다**
--
-- 원천이 "언제 기준"인지를 안 준다. 그래서 받은 날짜를 키로 쌓는다. 덕분에 추이는
-- 한 달쯤 지나면 저절로 생긴다 — 원천이 과거를 안 주므로 이 방법뿐이다.
-- ⛔ 키를 ticker 하나로 두지 말 것. 덮어쓰면 추이가 영영 안 생긴다.
--
-- ## ⚠️ us_stocks 에 외래키를 걸지 않는다
--
-- `extract_telegram_us_stocks.py` 가 매 실행 us_stocks 를 통째로 덮어써서, 종목이
-- 빠지는 순간 이 표의 적재가 통째로 실패한다. 049·051 이 같은 이유로 FK 를 뺐다.
--
-- ## ⚠️ 출처를 화면에 적어야 한다
--
-- stockanalysis.com 이용약관: 전문 재게시는 허락 없이 금지, **발췌는 수정하지 않고
-- 출처를 분명히 밝히면 허용.** 그래서 숫자를 손대지 않고(반올림·재계산 금지) 카드에
-- 출처를 적는다. 원자료는 S&P Global 집계이며 그 사실도 함께 적는다.

create table if not exists public.us_analyst_consensus (
  ticker text not null,
  -- ⚠️ 원천의 기준일이 아니라 **우리가 받은 날**이다. 원천이 시점을 안 준다.
  as_of_date date not null,
  -- "Strong Buy" · "Buy" · "Hold" · "Sell" · "Strong Sell". 원문 그대로 담고 화면에서 옮긴다.
  consensus text,
  -- 원천이 매기는 0~10 점. 등급 문자열과 짝이라 함께 담는다.
  score numeric,
  -- 등급을 낸 애널리스트 수. ⚠️ target_count 와 다른 수다.
  analyst_count integer,
  strong_buy integer,
  buy integer,
  hold integer,
  sell integer,
  strong_sell integer,
  target_avg numeric,
  target_median numeric,
  target_low numeric,
  target_high numeric,
  -- 목표가를 낸 애널리스트 수. ⚠️ analyst_count 와 다른 수다.
  target_count integer,
  currency text,
  -- 집계 주체. 지금은 전부 "spg"(S&P Global)다.
  source text,
  updated_at timestamptz not null default now(),
  primary key (ticker, as_of_date)
);

comment on table public.us_analyst_consensus is
  '애널리스트 등급 분포와 목표가. stockanalysis.com 이 싣는 S&P Global 집계이며, 시점은 우리가 받은 날이다';
comment on column public.us_analyst_consensus.as_of_date is
  '⚠️ 원천의 기준일이 아니라 **우리가 받은 날**이다. 원천이 시점을 안 줘서 이걸로 추이를 쌓는다';
comment on column public.us_analyst_consensus.analyst_count is
  '⚠️ 등급을 낸 애널리스트 수. 목표가를 낸 수(target_count)와 다르다 — NVDA 는 62 대 59였다';

create index if not exists idx_us_analyst_consensus_ticker
  on public.us_analyst_consensus (ticker, as_of_date desc);

-- ⚠️ 정책은 만들지 않는다. 화면은 서비스 키(`getSupabaseAdmin`)로 읽어 RLS 를 우회하고,
--    브라우저에 나가는 anon 키로는 아무것도 못 읽는 상태가 맞다. 045~048 이 같은 모양이다.
alter table public.us_analyst_consensus enable row level security;
