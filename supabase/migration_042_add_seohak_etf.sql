-- Hatzze — 마이그레이션 042: 국내 상장 미국 ETF 일별 (KRX)
--
-- 서학개미가 미국에 가는 길은 둘이다. 직접 사거나(예탁원 결제 통계 = 031), 국내에
-- 상장된 미국 ETF 를 사거나. 이 표가 두 번째 길을 맡는다.
--
-- ## 이 표가 여는 것 — 다른 원천으로는 못 하는 셋
--
-- 1. **괴리율.** 종가와 순자산가치(NAV)가 같은 행에 있다. 예측이 아니라 산수라
--    100% 맞고, 읽으면 바로 돈이 남는다. 2026-08-13 실측으로 거래대금 1억 이상
--    203종목의 중앙값이 +0.07% 인데 좁은 테마 신상품은 +1.28% 까지 벌어진다.
-- 2. **실제로 남은 돈.** 상장좌수(LIST_SHRS)의 하루 변화 × NAV 가 순유입이다.
--    거래대금은 같은 돈이 오간 것까지 세지만 좌수 변화는 설정·환매만 잡는다.
--    2026-08-13 실측 +2,477억(272종목 중 좌수가 변한 건 84종목뿐이다).
-- 3. **환헤지 여부로 갈린 자금 흐름.** 같은 날 (H) 붙은 50종목은 −85억인데 언헤지
--    222종목은 +2,562억이었다. 환율 카드를 안 만들고도 환율 얘기가 된다.
--
-- ## 원천
--
-- KRX Open API `etp/etf_bydd_trd` (AUTH_KEY 헤더). 하루 1,163종목이 오는데 그중
-- **미국 기초자산 273종목만** 담는다. 전량을 담으면 이 화면이 안 쓰는 890행이 매일
-- 쌓인다 — [[project_supabase_free_tier_capacity]] 의 전송량 문제와 같은 형태다.
--
-- ⚠️ **미국 판정은 종목명으로 한다.** 기초지수명으로 하면 안 된다 — 실측하면
-- `S&P GSCI GOLD`(금선물) · `S&P Korea 저변동성` · `Dow Jones Target 2030`(TDF) 처럼
-- 미국 지수사업자가 만든 **비미국 상품**이 43건 걸린다. 반대로 종목명 규칙은
-- `KODEX 미국서학개미`(iSelect 지수) 같은 것도 제대로 잡는다.
--
-- ⚠️ 이용약관 제6조 ② — KRX 는 **비상업적 이용 한정 + 출처 표기 강제**다.
-- 031 의 예탁원(제2유형)과 같은 제약이라, 수익화할 때 걷어낼 목록에 하나 더다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.seohak_etf_daily (
  trade_date   date not null,
  isu_cd       text not null,
  isu_nm       text not null,
  close_price  numeric,
  nav          numeric,
  premium_pct  numeric,
  fluc_rate    numeric,
  trade_value  numeric,
  list_shares  numeric,
  net_asset    numeric,
  net_flow     numeric,
  index_name   text,
  is_hedged    boolean not null default false,
  is_leverage  boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (trade_date, isu_cd)
);

comment on table public.seohak_etf_daily is
  '국내 상장 미국 ETF 일별 시세·순자산(KRX Open API etp/etf_bydd_trd). 미국 기초자산만 담는다. ⚠️ KRX 약관 제6조 ② — 비상업적 이용 한정 · 출처 표기 필수';
comment on column public.seohak_etf_daily.premium_pct is
  '괴리율 = (종가 − NAV) ÷ NAV × 100. 양수면 순자산가치보다 비싸게 거래된 것이다. 저장할 때 계산해 둔다 — 화면이 매번 다시 재면 반올림 자리가 갈린다';
comment on column public.seohak_etf_daily.net_flow is
  '순유입(원) = (오늘 상장좌수 − 직전 거래일 상장좌수) × 오늘 NAV. 거래대금과 다르다 — 거래대금은 같은 돈이 오간 것도 세지만 좌수 변화는 설정·환매만 잡는다. ⚠️ 직전 거래일 행이 없으면 null 이다(적재 첫날·상장일)';
comment on column public.seohak_etf_daily.trade_value is
  '거래대금(원, ACC_TRDVAL). 회전을 재는 값이지 유입이 아니다';
comment on column public.seohak_etf_daily.is_hedged is
  '환헤지형 여부. 종목명에 (H) 또는 (합성 H). ⭐ 실측상 유입 방향이 언헤지형과 반대로 갈린다';
comment on column public.seohak_etf_daily.is_leverage is
  '레버리지·인버스 여부. 거래대금 비중이 0.6% 뿐이라 카드 한 장은 못 되고 각주로 쓴다';
comment on column public.seohak_etf_daily.index_name is
  '기초지수명(IDX_IND_NM). ⚠️ 미국 여부 판정에는 쓰지 말 것 — S&P GSCI 금선물·S&P Korea 처럼 미국 지수사업자의 비미국 상품이 섞인다';

create index if not exists seohak_etf_daily_date_idx
  on public.seohak_etf_daily (trade_date desc, trade_value desc);
create index if not exists seohak_etf_daily_isu_idx
  on public.seohak_etf_daily (isu_cd, trade_date desc);

alter table public.seohak_etf_daily enable row level security;

create policy "seohak_etf_daily_public_read"
  on public.seohak_etf_daily
  for select
  to anon, authenticated
  using (true);
