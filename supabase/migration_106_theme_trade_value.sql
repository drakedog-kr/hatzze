-- Hatzze — 마이그레이션 106: 종목별 일별 거래대금 (테마 판세 · 테마 상세의 '3일 평균 거래대금')
--
-- 테마 화면(`/theme` · `/theme/us`)은 채널 언급 점유율만 보였다. 같은 테마에 실제로 돈이 얼마나 오갔는지를
-- 옆에 두려고 종목마다 그날 거래대금을 쌓는다. 테마 합은 화면이 테마 사전(lib/stock-themes.ts ·
-- lib/us-stock-themes.ts)으로 더한다 — 표에는 종목 값만 둔다(테마 상세의 종목 줄도 같은 값을 쓸 수 있게).
--
-- ## 국장 — stock_price_daily 에 칸 하나(마이그레이션 093 의 표)
--
-- KRX 일별매매정보(stk_bydd_trd · ksq_bydd_trd)는 종가와 같은 줄에 거래대금(ACC_TRDVAL, 원)을 준다.
-- fetch_krx_price_history.py 가 이미 날마다 그 응답을 받는데 종가 · 등락률만 넣고 버리고 있었다.
-- 반도체 하루 거래대금이 10조를 넘어(2026-10-20 SK하이닉스 4.2조) integer 로는 모자라 bigint 다.
-- 이 마이그레이션 전에 쌓인 날은 비어 있다 — 수집기가 거래대금이 빈 날을 다시 받아 채운다(45일 창 안).
--
-- ## 미장 — us_stock_price_daily(새 표)
--
-- 미국 종목은 KRX 같은 공식 일괄 원천이 없다. 핀허브 무료 시세(미리보기가 쓰는 것)엔 거래량이 없어
-- 야후 일봉의 종가 · 거래량(주식 수)을 받는다(fetch_us_price_history.py — 미장 테마 사전의 티커만).
-- 거래대금은 종가 × 거래량이다. 야후는 거래대금을 주지 않는다 — 장중 가격의 가중평균과 조금 다르다.
-- ⚠️ 야후 약관 §2(e)(i)의 상자(자동 수집 · 상업 이용)다 — 지수 종가 · 카더라 미장 시세와 같은 상자다.
--
-- Supabase SQL Editor에서 실행하세요. 안 돌려도 수집기 · 화면이 물러선다(거래대금 칸만 비고 나머지는 그대로).

alter table public.stock_price_daily
  add column if not exists trade_value bigint;

comment on column public.stock_price_daily.trade_value is 'KRX 거래대금(ACC_TRDVAL, 원). 마이그레이션 106 전에 쌓인 날은 null';

create table if not exists public.us_stock_price_daily (
  ticker       text not null,
  date         date not null,
  close        numeric not null,
  volume       bigint not null,
  trade_value  numeric not null,
  primary key (ticker, date)
);

comment on table public.us_stock_price_daily is
  '야후 일봉 종가 · 거래량(미장 테마 사전 티커). 테마 화면의 3일 평균 거래대금';
comment on column public.us_stock_price_daily.ticker is '미장 테마 사전의 티커(us_stocks.ticker). BRK 처럼 야후 심볼이 다른 것도 사전 티커로 둔다';
comment on column public.us_stock_price_daily.date is '미국 세션 날짜(뉴욕). 휴장일은 행이 없다';
comment on column public.us_stock_price_daily.close is '야후 일봉 종가(USD, 분할 반영)';
comment on column public.us_stock_price_daily.volume is '야후 일봉 거래량(주식 수)';
comment on column public.us_stock_price_daily.trade_value is '종가 × 거래량(USD)';

-- 화면은 날짜 범위로 읽는다(기본키는 ticker 가 앞이라 그 조회에 못 쓴다).
create index if not exists us_stock_price_daily_date_idx
  on public.us_stock_price_daily (date);

alter table public.us_stock_price_daily enable row level security;

create policy "us_stock_price_daily_public_read"
  on public.us_stock_price_daily
  for select
  to anon, authenticated
  using (true);
