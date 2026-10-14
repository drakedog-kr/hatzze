-- Hatzze — 마이그레이션 100: ETF '1년'을 정확히 1년으로 (etf_flow_year 시작일)
--
-- 097 은 1년의 시작을 '365일 앞 날짜 이전의 가장 가까운 달 말일'(etf_price_snapshot)로 잡았다. 일별 표가 없던 때의
-- 구현 제약이었는데, 그 탓에 창이 12~13개월을 오갔다 — 10-12 기준 2025-09-30 부터라 KODEX 200 1년이 +115.1%
-- (정확한 1년 2025-10-10 종가부터면 +101.6%), KODEX 레버리지 +212.8%(+174.8%).
-- 이제 일별 표(etf_flow_daily)가 2025-09-08 부터 차 있으니 **365일 앞 날짜 이전의 가장 가까운 거래일**로 바꾼다.
-- 거래일은 KODEX 200(069500)의 행으로 가른다(lib/etf-flow.ts CALENDAR_CODE). 커버드콜 · 레버리지(lib/etf-extras.ts) ·
-- 상세(lib/etf-detail.ts)도 같은 날을 쓴다 — 한 곳만 바꾸면 같은 '1년'이 화면마다 다른 날에서 시작한다.
--
-- 뷰 본문은 시작일만 빼고 097 그대로다. 새로 고치는 함수 refresh_etf_flow_year() 는 이름으로 부르니 그대로 돈다.
--
-- Supabase SQL Editor에서 실행하세요.

drop materialized view if exists public.etf_flow_year;

create materialized view public.etf_flow_year as
with bounds as (
  select
    (select max(d.trade_date)
       from public.etf_flow_daily d
      where d.isu_cd = '069500'
        and d.trade_date <= (select max(trade_date) from public.etf_flow_daily) - 365) as base_date,
    (select min(trade_date) from public.etf_flow_daily) as first_date
)
select
  e.isu_cd,
  b.base_date,
  b.first_date,
  sum(e.net_flow)        filter (where e.trade_date > b.base_date)                      as flow_1y,
  count(*)               filter (where e.trade_date > b.base_date and e.net_flow > 0)   as in_days,
  count(e.net_flow)      filter (where e.trade_date > b.base_date)                      as flow_days,
  max(e.close_price)     filter (where e.trade_date = b.base_date)                      as base_close
from public.etf_flow_daily e
cross join bounds b
where e.trade_date >= b.base_date
group by e.isu_cd, b.base_date, b.first_date;

comment on materialized view public.etf_flow_year is
  'ETF 마다 1년 순유입 합 · 들어온 날 수 · 값이 있는 날 수 · 시작일 종가(시작 = 365일 앞 날짜 이전의 가장 가까운 거래일). ETF 자금 흐름 화면(/etf)이 읽는다. 수집기가 새로 고친다';

create unique index if not exists etf_flow_year_isu_idx on public.etf_flow_year (isu_cd);

grant select on public.etf_flow_year to anon, authenticated, service_role;
