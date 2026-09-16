-- Hatzze — 마이그레이션 078: 배당성향 — 국내는 KIND 배당정보, 미국은 stockanalysis 요약 칸
--
-- 배당성향(배당금 총액 ÷ 당기순이익)은 "이 배당이 계속 갈 수 있나"의 첫 잣대다. 100% 를 넘으면 번 것보다
-- 많이 준 것이다. 배당으로 살기 화면이 담은 줄에 적고 100% 초과에 주의를 붙인다.
--
--   국내  KIND '배당정보'(상장법인 배당 관련 공시 요약, 회사마다 지난 사업연도 한 줄) → 새 표 kr_dividend_payout
--         (data-pipeline/scripts/fetch_kr_dividend_payout.py, 매일 전량 교체)
--   미국  stockanalysis 배당 페이지 요약 칸(Payout Ratio · Growth Years) → us_dividend_stock 에 열 둘
--         (fetch_us_dividends.py 가 매일 지급 건을 받을 때 같이 읽는다)
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.kr_dividend_payout (
  code              text primary key,
  name              text not null,
  corp_name         text not null,
  biz_year          integer,
  settle_month      integer,
  sector            text,
  dps               numeric,
  payout_pct        numeric,
  individual_basis  boolean not null default false,
  total_dividend    numeric,
  market_yield_pct  numeric,
  computed_for      date not null,
  updated_at        timestamptz not null default now()
);

comment on table public.kr_dividend_payout is
  'KIND 배당정보 — 회사마다 지난 사업연도의 주당배당금·배당성향·총배당금액·시가배당률. 배당이 있는 회사만. 매일 전량 교체';
comment on column public.kr_dividend_payout.payout_pct is '배당성향(%) = 배당금 총액 ÷ 연결 당기순이익. individual_basis 면 개별(별도) 순이익 기준(KIND 의 *)';
comment on column public.kr_dividend_payout.dps is '그 사업연도 1주당 배당금 합(원). 12개월 합(kr_dividend_stock.ttm_dps)과 기간이 다르다';
comment on column public.kr_dividend_payout.market_yield_pct is 'KIND 가 적은 시가배당률(%). 화면은 안 쓴다 — 우리 수익률은 전일 종가로 낸다';

alter table public.kr_dividend_payout enable row level security;

create policy "kr_dividend_payout_public_read"
  on public.kr_dividend_payout
  for select
  to anon, authenticated
  using (true);

alter table public.us_dividend_stock add column if not exists payout_pct numeric;
alter table public.us_dividend_stock add column if not exists growth_years integer;

comment on column public.us_dividend_stock.payout_pct is 'stockanalysis 의 Payout Ratio(%) — 지난 12개월 배당 ÷ 주당순이익';
comment on column public.us_dividend_stock.growth_years is 'stockanalysis 의 Growth Years — 배당을 해마다 늘려 온 햇수(코카콜라 64). SEC 로 센 연속 연수(streak_years)는 공시 시작 탓에 19~20 에서 막힌다';
