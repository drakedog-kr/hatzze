-- Hatzze — 마이그레이션 096: ETF 추적 지수 값 + 달마다 말일 가격 (ETF 자금 흐름 화면의 커버드콜 · 레버리지 비교)
--
-- ① etf_flow_daily.index_value — KRX 응답의 추적 지수 값(OBJ_STKPRC_IDX). 레버리지 · 인버스는 **원지수 값**으로 온다
--    (KODEX 레버리지의 추적 지수가 '코스피 200' · 2025-10-10 값 506.97 = 코스피200). 그래서 '지수 × 배수' 대 실제 NAV 를
--    같은 표 안에서 맞댈 수 있다.
-- ② etf_price_snapshot — 지난 열세 달의 달마다 마지막 거래일 하루치(전 ETF 의 종가 · NAV · 지수 값). 1년 동안의 가격 변화를
--    재는 기준점이다. 일별 표를 1년치로 늘리면(29만 행) 쓰는 건 열세 날뿐이라 따로 둔다. KRX 는 날짜 하나에 전 ETF 를 주므로
--    한 달에 한 번 호출이다. 채우는 쪽은 `data-pipeline/scripts/fetch_etf_snapshots.py`.
--
-- ⚠️ 뷰 etf_flow_board 는 `e.*` 를 만들 때 펼쳐 두어 칸을 더해도 그대로다(새 칸은 뷰에 안 실린다).
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.etf_flow_daily add column if not exists index_value numeric;

comment on column public.etf_flow_daily.index_value is
  '추적 지수 값(KRX OBJ_STKPRC_IDX). 레버리지 · 인버스는 원지수(코스피200 등) 값으로 온다';

create table if not exists public.etf_price_snapshot (
  code         text not null,
  trade_date   date not null,
  name         text,
  close_price  numeric,
  nav          numeric,
  index_value  numeric,
  primary key (code, trade_date)
);

comment on table public.etf_price_snapshot is
  'ETF 달마다 마지막 거래일 종가 · NAV · 추적 지수 값(KRX etp/etf_bydd_trd). 1년 가격 변화의 기준점. 비상업 한정';

create index if not exists etf_price_snapshot_date_idx
  on public.etf_price_snapshot (trade_date);

alter table public.etf_price_snapshot enable row level security;

create policy "etf_price_snapshot_public_read"
  on public.etf_price_snapshot
  for select
  to anon, authenticated
  using (true);
