-- Hatzze — 마이그레이션 099: 미국 종목 액면분할 기록 (내부자 리포트 13F 분기 비교 보정)
--
-- 13F 주식 수는 분할을 보정하지 않는다. 2026 Q2 에 카바나(5:1) · 부킹(25:1) · KLA(10:1)가 거의 모든
-- 보유자에서 '늘림'으로 섰다. 화면(lib/insider-13f.ts splitAdjOf)이 이 표의 배수로 주식 수를 나눠 견준다.
--
-- 채우는 쪽은 data-pipeline/scripts/fetch_us_splits.py — 13F 이웃 분기 주당 값이 크게 벌어진 종목만
-- yfinance 분할 기록에서 받는다(13F 와 같은 창에서 fetch_us_13f.py 바로 뒤).
-- 화면은 이 표가 없거나 못 읽으면 보정 없이 예전처럼 견준다(lib/us-stock-split.ts).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.us_stock_split (
  ticker   text not null,
  ex_date  date not null,
  ratio    numeric not null check (ratio > 0),
  primary key (ticker, ex_date)
);

comment on table public.us_stock_split is
  '미국 종목 액면분할(yfinance). 13F 분기 비교에서 주식 수를 분할 전 단위로 맞추는 데만 쓴다';
comment on column public.us_stock_split.ticker is 'us_manager_holding.ticker 와 같은 표기(BRK-B)';
comment on column public.us_stock_split.ex_date is '분할 적용일';
comment on column public.us_stock_split.ratio is '새 주식 수 ÷ 옛 주식 수. 5:1 분할이면 5, 1:3 역분할이면 0.3333';

alter table public.us_stock_split enable row level security;

create policy "us_stock_split_public_read"
  on public.us_stock_split
  for select
  to anon, authenticated
  using (true);
