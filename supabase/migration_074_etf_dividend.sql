-- Hatzze — 마이그레이션 074: ETF 분배금 (배당으로 살기 화면의 ETF 쪽)
--
-- 분배금은 열린 원천이 없어 **운용사 공시를 손으로 옮긴 설정 파일**(data-pipeline/config/etf_dividends.py)이
-- 원천이다. 스크립트(fetch_etf_dividends.py)는 거기에 시세(KRX·핀허브)와 환율(FRED)만 매일 붙인다.
-- 그래서 `as_of`(분배금을 옮긴 날)와 `computed_for`(시세를 붙인 날)가 다르다 — 화면은 `as_of` 를 적는다.
--
-- ⚠️ 국내 ETF 는 연도 합계만 있어 `payments` 가 비고 달력에서 빠진다. 미국 다섯은 지급일이 있다.
-- ⚠️ `estimated` 가 참이면 올해 합계를 열두 달로 늘린 값이다(지난해와 25% 넘게 갈릴 때).
--
-- ⚠️ 번호 074 는 2026-09-12 기준으로 비어 있던 것이다. 머지 직전에 origin/main 을 다시 볼 것.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.etf_dividend (
  code            text primary key,
  market          text not null,
  currency        text not null,
  name_ko         text not null,
  name_en         text,
  cadence         text,
  ttm_dps         numeric not null default 0,
  estimated       boolean not null default false,
  payments        jsonb not null default '[]'::jsonb,
  pay_months      jsonb not null default '[]'::jsonb,
  as_of           date not null,
  source          text,
  close           numeric,
  price_date      date,
  ttm_yield_pct   numeric,
  usdkrw          numeric,
  usdkrw_date     date,
  computed_for    date not null,
  updated_at      timestamptz not null default now()
);

comment on table public.etf_dividend is
  'ETF 분배금 — 운용사 공시를 손으로 옮긴 설정(config/etf_dividends.py) + 매일 붙이는 시세·환율. 배당으로 살기 화면의 ETF 쪽';
comment on column public.etf_dividend.market is 'KR · US';
comment on column public.etf_dividend.ttm_dps is '1년 분배금(원 또는 달러). 미국은 마지막 열두 달 지급 합, 국내는 지난해 합(또는 올해를 늘린 추정)';
comment on column public.etf_dividend.as_of is '분배금을 운용사 공시에서 옮긴 날. 화면이 "OO 기준"으로 적는다';
comment on column public.etf_dividend.payments is '[{pay, amount}] 미국 ETF 의 지급 건. 달력이 쓴다';

alter table public.etf_dividend enable row level security;

create policy "etf_dividend_public_read"
  on public.etf_dividend
  for select
  to anon, authenticated
  using (true);
