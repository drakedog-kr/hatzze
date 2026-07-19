-- Hatzze — 마이그레이션 015: stocks 에 종가·등락률 추가 (카더라 리포트)
-- KRX 일별매매정보(stk_bydd_trd/ksq_bydd_trd)는 종목명과 함께 종가(TDD_CLSPRC)와
-- 등락률(FLUC_RT)도 준다. 이미 매일 호출하고 있으므로 추가 비용 없이 저장한다.
-- 카더라 리포트의 급부상 종목 카드에서 "지금 얼마인지"를 함께 보여주는 데 쓴다.
--
-- ※ KRX 데이터는 며칠 지연될 수 있어 price_date 를 함께 저장한다 —
--   화면에서 "언제 기준 종가"인지 밝혀 오해를 막는다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.stocks
  add column if not exists close_price integer,
  add column if not exists change_rate numeric,
  add column if not exists price_date date;

comment on column public.stocks.close_price is 'KRX 종가(TDD_CLSPRC), price_date 기준';
comment on column public.stocks.change_rate is 'KRX 전일대비 등락률(FLUC_RT, %)';
comment on column public.stocks.price_date is '종가 기준일(KRX basDd). KRX 지연으로 오늘이 아닐 수 있음';
