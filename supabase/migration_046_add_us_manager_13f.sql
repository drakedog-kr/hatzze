-- Hatzze — 마이그레이션 046: 월가 거물 30명의 13F 보유
--
-- 내부자 리포트(/insider)의 세 번째 축이다. 임원(Form 4)·의원(STOCK Act)과 달리
-- **분기 자료**이고, 이 화면에서는 뉴스가 아니라 **맥락 열**로 쓴다.
--
-- ## ⚠️ 명단은 30명이고 지수형은 일부러 뺐다
--
-- 누구를 넣는지가 몇 명을 넣는지보다 훨씬 크게 갈린다. 실측(2026-08-20):
--
--   보유 300종목 초과 5곳(시타델 4,885 · 포인트72 2,302 · 고담 1,549 ·
--   브리지워터 990 · 국민연금 546)은 NVDA·GOOGL·MU·AAPL·AMZN·META 를 **전부 5/5** 보유
--
-- 시장을 통째로 사는 곳이라 "보유"가 아무 정보도 안 담는다. 명단과 제외 사유는
-- data-pipeline/config/us_managers.py 에 있다. ⛔ 거기 적힌 제외 목록을 되넣지 말 것.
--
-- 이 30명으로 잰 결과: 언급 상위 30종목 기준 중앙값 2/30 · 최대 19/30(GOOGL).
--
-- ## ⚠️ 운용사마다 기준 분기가 다르다
--
-- 명단을 만든 날 퍼싱 스퀘어만 최신 제출이 2026-03-31 이고 나머지 29곳은 2026-06-30
-- 이었다. 그래서 report_date 를 **운용사마다** 들고 있어야 한다. 하나로 뭉뚱그리면
-- 한 분기 낡은 값이 최신으로 위장한다.
--
-- ## ⚠️ 보유 표는 '현재 보유'만 담는다
--
-- 분기가 넘어가면 그 운용사의 옛 행을 지우고 새로 넣는다(스크립트가 지우고 넣는다).
-- 분기를 쌓으면 화면이 "지금 몇 명이 들고 있나"를 물을 때마다 최신 분기를 골라내야
-- 하는데, 운용사마다 분기가 달라서 그 판정이 매번 틀릴 자리가 된다.
--
-- Supabase SQL Editor에서 실행하세요.

-- ── 추적 대상 30명 ────────────────────────────────────────────────
create table if not exists public.us_manager (
  cik bigint primary key,
  person text not null,
  firm text not null,
  report_date date,
  holding_count integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.us_manager is
  '내부자 리포트가 추적하는 월가 거물 30명. 원본 명단은 config/us_managers.py 이고 이 표는 그 사본이다(프론트가 파이썬 설정을 못 읽어서)';
comment on column public.us_manager.report_date is
  '⚠️ 이 운용사가 낸 최신 13F 의 **기준 분기말**. 운용사마다 다르다 — 하나로 뭉뚱그리면 낡은 값이 최신으로 위장한다';
comment on column public.us_manager.holding_count is
  '그 제출의 전체 보유 종목 수(우리 종목만이 아니라 전부). 300을 넘으면 지수형이라 명단에서 빼야 한다는 잣대다';

alter table public.us_manager enable row level security;

-- ── 보유 (우리 종목만) ────────────────────────────────────────────
create table if not exists public.us_manager_holding (
  cik bigint not null references public.us_manager (cik) on delete cascade,
  ticker text not null references public.us_stocks (ticker),
  report_date date not null,
  shares numeric,
  value numeric,
  cusip text,
  updated_at timestamptz not null default now(),
  primary key (cik, ticker)
);

comment on table public.us_manager_holding is
  '거물 30명이 보유한 종목 중 **us_stocks 에 있는 것만**. 30명 전체 보유는 1만 종목이 넘는데 화면이 쓰는 건 카더라에 오른 것뿐이다';
comment on column public.us_manager_holding.value is
  '13F 가 신고한 평가금액(달러). ⚠️ 분기말 기준이라 지금 값이 아니다';
comment on column public.us_manager_holding.cusip is
  '13F 가 티커 대신 주는 식별자. 화면에 띄우지 않는다 — 조인 키로만 쓴다';

create index if not exists us_manager_holding_ticker_idx
  on public.us_manager_holding (ticker);

alter table public.us_manager_holding enable row level security;
