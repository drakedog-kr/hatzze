-- Hatzze — 마이그레이션 073: 미국 배당주 요약 (배당으로 살기 화면의 미국 쪽)
--
-- 국내 `kr_dividend_stock`(072)의 미국 판이다. 원천이 다르다 — 배당은 SEC 공시(XBRL
-- companyfacts, 미국 정부 저작물이라 약관 제약 없음), 시세는 핀허브, 환율은 FRED.
-- 파이프라인이 매일 종목 한 줄로 만든다(data-pipeline/scripts/fetch_us_dividends.py).
--
-- ⚠️ 금액은 **달러**다. 화면이 `usdkrw` 로 원화를 같이 보여 준다.
-- ⚠️ 지급 달이 없다. XBRL 은 기간만 있고 지급일이 없어서, 화면 달력에서 미국 종목은 뺀다.
-- ⚠️ `ttm_method` 가 'annualized' 면 마지막 분기 × 4 다(엑슨모빌처럼 연 행이 없는 회사).
--    화면은 그 값 옆에 '추정'이라 적는다.
-- ⚠️ 대상은 카더라 사전(`us_stocks`) + config/us_dividend_universe.py 의 배당주 목록이다.
--    ETF·외국 회사(20-F)는 SEC 태그가 없어 아직 못 넣는다.
--
-- ⚠️ 번호 073 은 2026-09-12 기준으로 비어 있던 것이다. 머지 직전에 origin/main 을 다시 볼 것.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.us_dividend_stock (
  ticker            text primary key,
  cik               integer,
  name_ko           text not null,
  name_en           text,
  close             numeric,
  price_date        date,
  ttm_dps           numeric not null default 0,
  ttm_method        text not null default 'none',
  ttm_yield_pct     numeric,
  annual            jsonb not null default '{}'::jsonb,
  streak_years      integer not null default 0,
  cut_years_5       integer not null default 0,
  growth_5y_pct     numeric,
  last_period_end   date,
  usdkrw            numeric,
  usdkrw_date       date,
  computed_for      date not null,
  updated_at        timestamptz not null default now()
);

comment on table public.us_dividend_stock is
  '미국 배당주 요약(SEC XBRL + 핀허브 시세 + FRED 환율, 매일 재계산). 배당으로 살기 화면의 미국 쪽 원천';
comment on column public.us_dividend_stock.ttm_dps is
  '최근 12개월 1주당 배당(달러). 방법은 ttm_method 참고';
comment on column public.us_dividend_stock.ttm_method is
  'quarters(마지막 네 분기 합) · monthly(마지막 열두 달 합) · annualized(마지막 분기×4, 추정) · fy(마지막 회계연도 값) · none';
comment on column public.us_dividend_stock.ttm_yield_pct is
  'ttm_dps ÷ close × 100. close 는 핀허브 마지막 체결가(달러)';
comment on column public.us_dividend_stock.annual is
  '회계연도별 1주당 배당(달러) {"2024": 1.94, …}. 6월·9월 결산은 끝나는 해로';
comment on column public.us_dividend_stock.usdkrw is
  '원/달러(FRED DEXKOUS, usdkrw_date 기준). 모든 행이 같은 값이다 — 화면이 한 번만 읽는다';

alter table public.us_dividend_stock enable row level security;

create policy "us_dividend_stock_public_read"
  on public.us_dividend_stock
  for select
  to anon, authenticated
  using (true);
