-- Hatzze — 마이그레이션 093: 국장 일별 종가 이력 (종목 상세 '커뮤니티 관심 추이'의 시세 선)
--
-- 종목 상세(`/stock/005930`)의 언급 막대 위에 같은 날의 종가 선을 겹친다. 미장 상세는 이미 받아 둔
-- 일봉(야후)을 쓰지만 국장 화면은 **야후를 부르지 않는다**(lib/stock-page.ts 머리말 ① — 화면이
-- 464장이라 크롤러가 훑으면 종목마다 바깥 요청이 붙는다). `stocks` 는 가장 최근 하루치 종가만
-- 들고 있어서(마이그레이션 015) 날짜별 값을 따로 쌓는다.
--
-- ## 원천 — KRX OPEN API 일별매매정보(stk_bydd_trd · ksq_bydd_trd)
--
-- 날짜 하나를 주면 그날 전 종목(코스피 940여 · 코스닥 1,820여)의 종가 · 등락률을 한 번에 준다.
-- `fetch_krx_stocks.py` 가 이미 매일 부르는 그 엔드포인트다. 지난 날짜도 그대로 받힌다(2026-10-10
-- 실측: 08-14 · 09-08 · 10-02 전부 200). 휴장일은 빈 목록이다.
-- 채우는 쪽은 `data-pipeline/scripts/fetch_krx_price_history.py` — 최근 기간 안에서 **빠진 날만**
-- 받아 넣는다. 첫 실행이 기간 전체를 채우고, 그 뒤로는 새로 공표된 하루씩 붙는다.
--
-- ⚠️ KRX 약관 제6조 ② 비상업 한정 · 제10조 ③ 출처 표기는 `stocks.close_price` 와 같은 상자다
--    (출처는 투자 유의사항 /disclaimer 한 곳에 적는다).
-- ⚠️ 종가는 수정주가가 아니다 — 그날 KRX 가 공표한 값 그대로다. 액면분할 같은 날은 선이 뛴다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.stock_price_daily (
  code         text not null,
  date         date not null,
  close        integer not null,
  change_rate  numeric,
  primary key (code, date)
);

comment on table public.stock_price_daily is
  'KRX 일별 종가(stk_bydd_trd · ksq_bydd_trd). 종목 상세 관심 추이의 시세 선. 비상업 한정';
comment on column public.stock_price_daily.code is '6자리 단축코드(stocks.code)';
comment on column public.stock_price_daily.date is '거래일(KRX basDd). 휴장일은 행이 없다';
comment on column public.stock_price_daily.close is 'KRX 종가(TDD_CLSPRC, 원). 수정주가 아님';
comment on column public.stock_price_daily.change_rate is 'KRX 전일대비 등락률(FLUC_RT, %)';

-- 빠진 날을 찾을 때 날짜로만 센다(기본키는 code 가 앞이라 그 조회에 못 쓴다).
create index if not exists stock_price_daily_date_idx
  on public.stock_price_daily (date);

alter table public.stock_price_daily enable row level security;

create policy "stock_price_daily_public_read"
  on public.stock_price_daily
  for select
  to anon, authenticated
  using (true);
