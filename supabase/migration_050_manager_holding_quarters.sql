-- Hatzze — 마이그레이션 050: 거물 보유를 분기별로 쌓는다
--
-- "월가 거물이 가장 많이 산 종목 / 판 종목"을 만들려면 **직전 분기와 견줘야** 한다.
-- 3월 31일에 없던 종목이 6월 30일에 생겼으면 신규 매수, 주식 수가 늘었으면 추가 매수다.
--
-- ## ⚠️ 지금 표는 '현재 보유'만 담아서 비교할 과거가 없다
--
--   들어 있는 기준 분기: 2026-06-30 → 492행 · 2026-03-31 → 5행
--
-- 기본키가 (cik, ticker) 라서 한 운용사당 종목 하나에 한 줄뿐이고, 수집기가 분기마다
-- 옛 행을 지우고 새로 넣는다. 그렇게 만든 이유가 있었다 — 운용사마다 기준 분기가 달라
-- "어느 게 최신인가" 판정이 매번 틀릴 자리였기 때문이다(퍼싱 스퀘어만 한 분기 늦다).
--
-- 그 문제는 **화면이 운용사별 최신 분기를 골라 읽는 것**으로 풀고, 표는 쌓게 바꾼다.
-- 대가로 얻는 게 분기 비교다.
--
-- ⚠️ 수집기도 같이 바뀐다: 이제 **그 운용사의 그 분기만** 지우고 넣는다
--    (`delete().eq("cik", …).eq("report_date", …)`). 통째로 지우면 과거가 또 날아간다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.us_manager_holding
  drop constraint if exists us_manager_holding_pkey;

alter table public.us_manager_holding
  add primary key (cik, ticker, report_date);

comment on table public.us_manager_holding is
  '거물이 보유한 종목 중 us_stocks 에 있는 것만. ⚠️ migration_050 부터 **분기를 쌓는다** — 직전 분기와 견줘 신규·증가·감소·청산을 낸다';
comment on column public.us_manager_holding.report_date is
  '⚠️ 기본키의 일부다. 운용사마다 기준 분기가 달라서(퍼싱 스퀘어가 한 분기 늦다) 화면은 **운용사별 최신 분기**를 골라 읽어야 한다 — 전체 최신 분기로 자르면 늦은 곳이 통째로 빠진다';

-- 분기 비교는 "이 운용사의 이 종목을 분기별로" 훑는다. 그 순서로 인덱스를 준다.
create index if not exists us_manager_holding_cik_ticker_idx
  on public.us_manager_holding (cik, ticker, report_date desc);
