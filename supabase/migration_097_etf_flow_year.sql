-- Hatzze — 마이그레이션 097: ETF 마다 1년 순유입 (ETF 자금 흐름 화면 'ETF 자금 흐름' 카드의 기간 '1년')
--
-- 화면은 하루 · 1주 · 1달 · 1년을 고른다(2026-10-12). 하루 ~ 1달은 뷰 etf_flow_board(20거래일)와 날별 읽기로 되지만 1년은
-- ETF 1,172개 × 250거래일 ≈ 29만 행을 더해야 해서 화면이 그때그때 셀 수 없다. 그래서 **ETF 마다 한 줄로 미리 접어 둔다**
-- (머티리얼라이즈드 뷰). 새로 고치는 건 수집기다 — fetch_etf_flows.py 가 하루치를 쓴 뒤 refresh_etf_flow_year() 를 부른다.
--
-- 1년의 시작은 커버드콜 · 레버리지의 1년과 같은 날이다 — 최근 거래일에서 365일 앞 날짜 이전의 가장 가까운 달 말일
-- (etf_price_snapshot 의 날짜 · lib/etf-extras.ts yearBase). 순유입은 그다음 거래일부터 더하고, 그날 종가(base_close)는 1년 수익률의
-- 기준으로 같이 싣는다(화면이 날 하나를 더 읽지 않게).
--
-- ⚠️ 일별 표(etf_flow_daily)가 그 시작일까지 거슬러 차 있어야 1년 합이 맞는다. first_date(표의 첫 날)가 base_date 보다
--    늦으면 화면은 '1년'을 켜지 않는다(lib/etf-flow.ts). 처음 채울 땐 `python scripts/fetch_etf_flows.py --days 400`.
--    (마이그레이션 096 머리말은 '일별 표를 1년치로 늘리지 않는다'고 했다 — 1년 유입을 고르게 하며 그 결정을 바꿨다.)
--
-- Supabase SQL Editor에서 실행하세요.

create materialized view if not exists public.etf_flow_year as
with bounds as (
  select
    (select max(s.trade_date)
       from public.etf_price_snapshot s
      where s.trade_date <= (select max(trade_date) from public.etf_flow_daily) - 365) as base_date,
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
  'ETF 마다 1년 순유입 합 · 들어온 날 수 · 값이 있는 날 수 · 시작일 종가(시작 = 365일 앞 이전의 달 말일). ETF 자금 흐름 화면(/etf)이 읽는다. 수집기가 새로 고친다';

create unique index if not exists etf_flow_year_isu_idx on public.etf_flow_year (isu_cd);

grant select on public.etf_flow_year to anon, authenticated, service_role;

-- 수집기(service_role)만 새로 고친다.
create or replace function public.refresh_etf_flow_year()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view public.etf_flow_year;
$$;

revoke all on function public.refresh_etf_flow_year() from public, anon, authenticated;
grant execute on function public.refresh_etf_flow_year() to service_role;
