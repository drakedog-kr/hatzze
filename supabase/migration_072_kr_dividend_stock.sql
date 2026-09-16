-- Hatzze — 마이그레이션 072: 종목별 배당 요약 (배당 계산기 화면이 읽는 표)
--
-- `kr_dividend`(7만 행 기록) × `stocks`(전일 종가)를 파이프라인이 매일 종목 한 줄로 접는다
-- (data-pipeline/scripts/calculate_kr_dividend_stats.py). 화면은 이 표 하나만 읽는다 —
-- 상장 종목 전부(2,777행)에 한 행씩이라 검색 목록·계산기·바스켓이 같은 표에서 나온다.
--
-- ⭐ 연도별 합(`annual`)은 **회계연도**로 묶는다. 12월 결산 회사의 1~4월 지급분은 전년도
--    결산 배당이다. 기준일 해로 묶으면 2024년부터 기준일을 2~3월로 옮긴 회사가 배당을 줄인
--    것처럼 보인다 — 세 가지를 재 본 경위는 스크립트 머리말.
-- ⚠️ `ttm_yield_pct` 의 분모는 `stocks.close_price`(KRX 전일 종가)다. 이 표는 하루 한 번
--    계산되므로 장중 시세와는 다르다. 화면은 "전일 종가 기준"이라 적는다.
-- ⚠️ `ttm_unusual` 이 참이면 최근 12개월 합이 그 전 회계연도의 두 배를 넘는다 — 특별·
--    청산배당이 섞인 표시다(코람코더원리츠 2026-08 8,900원). 바스켓은 이 종목을 거른다.
--
-- ⚠️ 번호 072 는 2026-09-11 기준으로 비어 있던 것이다. 머지 직전에 origin/main 을 다시 볼 것.
--
-- Supabase SQL Editor에서 실행하세요.

-- 바스켓이 "시가총액 3,000억 이상"으로 거른다. KRX 일별 응답에 이미 있던 칸(MKTCAP)을
-- fetch_krx_stocks.py 가 저장만 안 하고 있었다.
alter table public.stocks add column if not exists market_cap numeric;
comment on column public.stocks.market_cap is '시가총액(원, KRX MKTCAP). price_date 기준';

create table if not exists public.kr_dividend_stock (
  code              text primary key,
  name              text not null,
  market            text,
  share_kind        text,
  is_reit           boolean not null default false,
  close             numeric,
  price_date        date,
  market_cap        numeric,
  ttm_dps           numeric not null default 0,
  ttm_count         integer not null default 0,
  ttm_yield_pct     numeric,
  ttm_unusual       boolean not null default false,
  pay_months        jsonb not null default '[]'::jsonb,
  ttm_payments      jsonb not null default '[]'::jsonb,
  annual            jsonb not null default '{}'::jsonb,
  streak_years      integer not null default 0,
  cut_years_5       integer not null default 0,
  growth_5y_pct     numeric,
  last_record_date  date,
  last_pay_date     date,
  next_record_date  date,
  computed_for      date not null,
  updated_at        timestamptz not null default now()
);

comment on table public.kr_dividend_stock is
  '종목별 배당 요약(상장 종목 전부, 매일 재계산). 배당 계산기 화면의 유일한 원천. 기록 원본은 kr_dividend';
comment on column public.kr_dividend_stock.ttm_dps is
  '최근 12개월(오늘 기준, 미래 기준일 제외) 1주당 현금배당 합(원, 액면분할 소급). 계산기의 분자';
comment on column public.kr_dividend_stock.ttm_yield_pct is
  'ttm_dps ÷ close × 100. close 는 계산 시점의 stocks.close_price(전일 종가)';
comment on column public.kr_dividend_stock.ttm_unusual is
  '12개월 합이 그 전 회계연도의 두 배를 넘는다 — 특별·청산배당이 섞인 표시. 바스켓은 거르고 화면은 옆에 적는다';
comment on column public.kr_dividend_stock.pay_months is
  '최근 12개월 지급일의 달 [4, 5, 8, 11]. "어느 달에 입금되나"';
comment on column public.kr_dividend_stock.ttm_payments is
  '최근 12개월 지급 건 [{record, pay, amount}]. 달력이 달마다 얼마인지 그린다 — 합을 달 수로 나누면 결산 몫이 큰 회사(KB금융 4월 1,605원)가 틀린다';
comment on column public.kr_dividend_stock.annual is
  '회계연도별 1주당 현금배당 합 {"2023": 3060, …}. 1~4월 지급분은 전년도(12월 결산 회사)';
comment on column public.kr_dividend_stock.streak_years is
  '가장 최근 끝난 회계연도부터 거슬러 몇 해 연속 현금배당이 있었나';
comment on column public.kr_dividend_stock.cut_years_5 is
  '최근 5개 회계연도 안에서 전년보다 줄인 해의 수. ⚠️ 특별배당 다음 해가 줄인 해로 잡힌다(삼성전자 FY2021)';
comment on column public.kr_dividend_stock.growth_5y_pct is
  '5년 연평균 증가율(%). 최근 끝난 해 ÷ 그 5년 전. 한쪽이 0 이면 null';
comment on column public.kr_dividend_stock.next_record_date is
  '오늘 뒤의 가장 가까운 배당기준일. 원천이 미리 준다(2026-09-11 실측 17종목)';

create index if not exists kr_dividend_stock_yield_idx
  on public.kr_dividend_stock (ttm_yield_pct desc nulls last);

alter table public.kr_dividend_stock enable row level security;

create policy "kr_dividend_stock_public_read"
  on public.kr_dividend_stock
  for select
  to anon, authenticated
  using (true);
