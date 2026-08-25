-- Hatzze — 마이그레이션 045: 미국 임원 공시(SEC Form 4)
--
-- 내부자 리포트 화면(/insider)의 첫 재료다. 카더라에 오른 미국 종목 옆에 그 회사
-- 임원이 무엇을 신고했는지를 붙인다.
--
-- ## ⚠️ 이 표에 쌓이는 것의 대부분은 "매수·매도"가 아니다
--
-- 실측(2026-08-19, 카더라에 오른 종목의 공시 150건 표본):
--
--   M 옵션 행사        36%
--   S 장내 매도        30%
--   F 세금 원천징수     17%
--   A 무상 취득(RSU)    8%
--   P 장내 매수       0.7%   ← 딱 1건
--
-- 같은 날 **시장 전체** 무작위 150건에서는 P 가 17%(26건)였다. 우리가 다루는 종목이
-- 대형 기술주라 임원이 자기 돈으로 사는 일이 25배 드물다. 그래서 화면에서 P 를
-- 특별 취급하되, **없는 날이 대부분이라는 사실 자체**를 적어야 한다.
--
-- 이 분포를 모르고 "임원 매수 N건" 같은 카드를 만들면 1년 내내 0 이 뜬다.
--
-- ## 표를 둘로 나눈 이유
--
-- us_insider_txn 은 거래 한 건이 한 행이다(L2 종목 상세가 읽는다).
-- us_insider_daily 는 창 단위로 미리 세어 둔 것이다(L1 메인 표가 읽는다).
--
-- 미리 세는 이유는 telegram_us_stock_breadth 와 같다. 7일 창이면 원자료가 1,000행을
-- 넘는데 PostgREST 는 1,000행에서 **에러 없이 조용히 자른다**. 메인 표가 종목별 집계만
-- 필요로 하므로 파이프라인이 돌 때 한 번 세어 둔다.
--
-- Supabase SQL Editor에서 실행하세요.

-- ── 거래 한 건 = 한 행 ────────────────────────────────────────────────
create table if not exists public.us_insider_txn (
  accession_no text not null,
  seq integer not null,
  ticker text not null references public.us_stocks (ticker),
  issuer_cik bigint not null,
  filed_date date not null,
  transaction_date date,
  transaction_code text,
  shares numeric,
  price numeric,
  shares_after numeric,
  acquired_disposed text,
  owner_name text,
  owner_title text,
  is_director boolean not null default false,
  is_officer boolean not null default false,
  is_ten_percent boolean not null default false,
  source_url text,
  updated_at timestamptz not null default now(),
  primary key (accession_no, seq)
);

comment on table public.us_insider_txn is
  'SEC Form 4 의 거래 한 건. 카더라에 오른 미국 종목(us_stocks)만 담는다 — 시장 전체를 받지 않는다';
comment on column public.us_insider_txn.accession_no is
  'EDGAR 접수번호. 한 공시에 거래가 여러 건이라 seq 와 함께 기본키를 이룬다';
comment on column public.us_insider_txn.filed_date is
  '⚠️ 거래일이 아니라 **접수일**이다. 실측으로 거래일에서 0~4일 걸린다(0일 7% · 1일 28% · 3일 50% · 4일 15%). 2영업일 규칙이라 금요일 거래가 화요일에 올라오면 달력으로 4일이다';
comment on column public.us_insider_txn.transaction_code is
  'P=장내 매수 · S=장내 매도 · M=옵션 행사 · A=무상 취득 · F=세금 원천징수 · C=전환 · G=증여. ⚠️ 대부분이 M·S·F 라 이걸 뭉뚱그려 "매도"로 적으면 틀린 말이 된다';
comment on column public.us_insider_txn.price is
  '⚠️ 코드에 따라 비어 있다. 무상 취득(A)이나 옵션 행사(M)는 단가가 0 이거나 행사가라 시장가가 아니다';
comment on column public.us_insider_txn.shares_after is
  '신고 뒤 남은 보유 주식 수. "얼마를 팔았나"보다 "얼마가 남았나"가 사람에게 더 읽힌다';

create index if not exists us_insider_txn_ticker_idx
  on public.us_insider_txn (ticker, filed_date desc);
create index if not exists us_insider_txn_filed_idx
  on public.us_insider_txn (filed_date desc);
create index if not exists us_insider_txn_code_idx
  on public.us_insider_txn (transaction_code, filed_date desc);

alter table public.us_insider_txn enable row level security;

-- ── 창 단위로 미리 세어 둔 것 ─────────────────────────────────────────
create table if not exists public.us_insider_daily (
  as_of_date date not null,
  window_days integer not null,
  ticker text not null references public.us_stocks (ticker),
  filing_count integer not null default 0,
  txn_count integer not null default 0,
  buy_count integer not null default 0,
  sell_count integer not null default 0,
  option_count integer not null default 0,
  other_count integer not null default 0,
  person_count integer not null default 0,
  latest_filed_date date,
  updated_at timestamptz not null default now(),
  primary key (as_of_date, window_days, ticker)
);

comment on table public.us_insider_daily is
  '창 안에서 그 종목에 쌓인 Form 4 집계. 메인 표(/insider)가 이걸 읽는다';
comment on column public.us_insider_daily.as_of_date is
  '창의 끝점. 화면은 이 값으로 창을 고정해 읽는다 — 읽기 시점에 창을 다시 잡으면 파이프라인과 숫자가 갈린다';
comment on column public.us_insider_daily.buy_count is
  '거래 코드 P(장내 매수)만 센다. ⚠️ 우리 종목에서는 0.7% 라 대부분의 날에 0 이다. 0 이 정상이니 카드를 숨기지 말고 그 사실을 적을 것';
comment on column public.us_insider_daily.option_count is
  'M(옵션 행사) + F(세금 원천징수) + A(무상 취득). 보상 제도에 딸린 기계적 흐름이라 매도와 같이 세면 안 된다';
comment on column public.us_insider_daily.person_count is
  '창 안에서 신고한 서로 다른 사람 수. 같은 사람이 여러 건 낸 것과 여러 사람이 움직인 것은 뜻이 다르다';

create index if not exists us_insider_daily_asof_idx
  on public.us_insider_daily (as_of_date desc, window_days, txn_count desc);

alter table public.us_insider_daily enable row level security;
