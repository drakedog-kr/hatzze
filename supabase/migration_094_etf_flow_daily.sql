-- Hatzze — 마이그레이션 094: 국내 상장 ETF 전체의 일별 자금 유출입 (ETF 자금 흐름 화면 /etf)
--
-- ETF 하나하나에 돈이 얼마나 들어오고 나갔는지를 날마다 쌓는다. 원천은 KRX OPEN API ETF 일별매매정보
-- (etp/etf_bydd_trd) — 날짜 하나를 주면 그날 상장된 ETF 전부(2026-10 기준 1,172종목)가 한 번에 온다.
--
-- ## 왜 seohak_etf_daily 를 넓히지 않고 새 표인가
--
-- seohak_etf_daily(마이그레이션 042)는 칸이 같지만 **미국 기초자산 ETF 만** 담고, 배당 화면이 그 표 전체를
-- 최근 30일 순유입으로 줄 세운다(lib/dividend.ts getTrends). 국내 ETF 를 섞으면 배당 화면의 순서가 바뀐다.
--
-- ## 순유입은 거래대금이 아니라 좌수 변화다
--
--     net_flow = (오늘 상장좌수 − 직전 거래일 상장좌수) × 오늘 NAV
--
-- 설정·환매로 실제로 들어오고 나간 돈만 잡는다. 2025-09 코스콤 ETF체크 기사의 '최근 1개월 유입 1위 ·
-- 유출 1위'(KODEX 머니마켓액티브 · KODEX 레버리지)를 이 식으로 다시 재면 둘 다 같았다(2026-10-11 실측).
-- ⚠️ 레버리지·인버스는 LP 의 설정·환매가 날마다 ±2천억씩 번갈아 하루 값이 크게 출렁인다 — 화면은 5·20거래일 합만 쓴다.
-- ⚠️ 좌수 변화는 하루이틀 늦게 반영된다 — 화면은 'N일 거래분까지'로 적는다.
--
-- 채우는 쪽은 `data-pipeline/scripts/fetch_etf_flows.py`. 화면은 아래 뷰(etf_flow_board)만 읽는다.
--
-- ⚠️ KRX 약관 제6조 ② 비상업 한정 · 제10조 ③ 출처 표기는 다른 KRX 표와 같은 상자다
--    (출처는 투자 유의사항 /disclaimer 한 곳에 적는다).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.etf_flow_daily (
  trade_date   date not null,
  isu_cd       text not null,
  isu_nm       text not null,
  index_name   text,
  close_price  numeric,
  nav          numeric,
  fluc_rate    numeric,
  trade_value  numeric,
  list_shares  numeric,
  net_asset    numeric,
  net_flow     numeric,
  updated_at   timestamptz not null default now(),
  primary key (trade_date, isu_cd)
);

comment on table public.etf_flow_daily is
  '국내 상장 ETF 전체의 일별 시세·순자산·순유입(KRX etp/etf_bydd_trd). ETF 자금 흐름 화면(/etf). 비상업 한정';
comment on column public.etf_flow_daily.trade_date is '거래일(KRX basDd). 휴장일은 행이 없다 — 휴장일에도 응답이 오므로 수집기가 거래대금 합계로 거른다';
comment on column public.etf_flow_daily.isu_cd is '단축코드(ISU_CD, 6자리 · 영문 섞일 수 있음)';
comment on column public.etf_flow_daily.index_name is '추적 지수(IDX_IND_NM). 갈래·기초자산을 가를 때 이름과 함께 쓴다';
comment on column public.etf_flow_daily.trade_value is '거래대금(원, ACC_TRDVAL). 회전을 재는 값이지 유입이 아니다';
comment on column public.etf_flow_daily.list_shares is '상장좌수(LIST_SHRS)';
comment on column public.etf_flow_daily.net_asset is '순자산총액(원, INVSTASST_NETASST_TOTAMT)';
comment on column public.etf_flow_daily.net_flow is
  '순유입(원) = (오늘 상장좌수 − 직전 거래일 상장좌수) × 오늘 NAV. 직전 거래일 행이 없으면(적재 첫날·상장일) null';

-- 종목 하나의 최근 기록을 찾을 때(기본키는 날짜가 앞이라 그 조회에 못 쓴다).
create index if not exists etf_flow_daily_isu_idx
  on public.etf_flow_daily (isu_cd, trade_date desc);

alter table public.etf_flow_daily enable row level security;

create policy "etf_flow_daily_public_read"
  on public.etf_flow_daily
  for select
  to anon, authenticated
  using (true);

-- ── 화면이 읽는 판 — ETF 마다 최근 5·20거래일 합 ──────────────────────────────────────────
--
-- 하루 1,172행이라 20거래일이면 2만 행이 넘는다. 화면이 그걸 다 받아 더하는 대신 여기서 ETF 하나에 한 줄로 접는다.
-- rk 는 '가장 최근 거래일이 1'인 거래일 순번이다(ETF 마다가 아니라 표 전체의 날짜 순번 — 그날 없던 ETF 는 그 순번이 빈다).
--   flow_5d · flow_20d   최근 5 · 20거래일 순유입 합(원)
--   in_days              20거래일 중 순유입이 0보다 큰 날 수 — 꾸준히 들어온 돈과 한꺼번에 들어온 돈을 가른다
--   flow_days            20거래일 중 순유입 값이 있는 날 수 — 20보다 작으면 그 안에 상장했거나 적재가 짧다
--   streak               가장 최근 거래일부터 거꾸로 순유입이 이어진 날 수
--   trade_value_5d       최근 5거래일 하루 평균 거래대금(원)
-- 가장 최근 거래일에 행이 있는 ETF 만 싣는다(상장폐지된 것은 빠진다).
-- security_invoker — 읽는 쪽의 권한으로 돈다(아래 표의 RLS 를 그대로 탄다).
create or replace view public.etf_flow_board
with (security_invoker = true) as
with days as (
  select trade_date, row_number() over (order by trade_date desc) as rk
  from (
    select distinct trade_date
    from public.etf_flow_daily
    where trade_date > current_date - 60
  ) t
  order by trade_date desc
  limit 20
),
w as (
  select e.*, d.rk
  from public.etf_flow_daily e
  join days d using (trade_date)
)
select
  isu_cd,
  max(trade_date) filter (where rk = 1)                              as as_of,
  max(isu_nm) filter (where rk = 1)                                  as isu_nm,
  max(index_name) filter (where rk = 1)                              as index_name,
  max(net_asset) filter (where rk = 1)                               as net_asset,
  max(fluc_rate) filter (where rk = 1)                               as fluc_rate,
  sum(net_flow) filter (where rk <= 5)                               as flow_5d,
  sum(net_flow)                                                      as flow_20d,
  count(*) filter (where net_flow > 0)                               as in_days,
  count(net_flow)                                                    as flow_days,
  coalesce(min(rk) filter (where net_flow is null or net_flow <= 0), max(rk) + 1) - 1 as streak,
  avg(trade_value) filter (where rk <= 5)                            as trade_value_5d
from w
group by isu_cd
having bool_or(rk = 1);

comment on view public.etf_flow_board is
  'ETF 마다 최근 5·20거래일 순유입 합 · 유입한 날 수 · 연속 유입 · 5거래일 평균 거래대금. ETF 자금 흐름 화면(/etf)이 읽는다';

grant select on public.etf_flow_board to anon, authenticated, service_role;
