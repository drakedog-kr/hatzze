-- Hatzze — 마이그레이션 031: 서학개미 해부도의 일별 층 (예탁결제원)
--
-- 030 이 만든 두 표는 월별(TIC)과 분기별(13F)이라 화면이 한 달에 한 번만 바뀐다.
-- 이 표가 **매일 바뀌는 층**을 맡는다.
--
-- ## 왜 예탁원인가
--
-- "매일 바뀌면서 진짜 한국인의 매매"인 원천이 이것 하나다(2026-08-10 실측):
--   한국 소재 발행사의 SEC 공시   60일에 41건(하루 0.7건) · 한국 '기업'이지 투자자가 아님
--   한국 기관 보유 종목의 8-K     매일 있으나 미국 기업 소식임
--   미국 상장 한국 ADR 시세        매일 있으나 한국 '기업'이고 야후 의존
--   **예탁원 결제 통계**          **일별 · 실제 매수/매도 · 1994년부터**
--
-- 원천: 공공데이터포털 금융위원회_국제거래외화증권예탁결제정보
--       apis.data.go.kr/1160100/GetDrForeSecuSettInfoService_V2/getMarkForeSecuSettStat_V2
--
-- ⚠️ **이용허락범위가 제2유형(출처표시 + 상업적 이용금지)이다.** KRX 약관 제6조 ② 와
-- 같은 제약이라, 광고·유료화를 붙일 때 걷어내야 할 목록에 하나 더 얹는 셈이다.
-- 화면에 출처를 글자 그대로 밝혀야 한다.
--
-- ## 실측으로 확인한 것 (2026-08-10)
--
--   기간        1994-08-16 ~ 2026-08-07 (오늘 기준 직전 영업일까지)
--   결제 지연   **T+1 영업일**. 가정이 아니라 실측이다 — 미국 휴장일 + N영업일의 매수
--               건수를 재면 lag=1 에서만 중앙값 23,927 → 6건으로 떨어진다(0·2·3·4 는
--               전부 평소의 1.2~1.3배).
--   미국 주식   2026-08-07 매수 33,471건 $1.31B · 매도 23,053건 $0.70B
--   미국 비중   해외주식 매수 중 1996년 0.3% → 2026년 94.1%
--
-- ⚠️⚠️ **TIC 순매수와 이 표의 순매수를 같은 화면에 나란히 두면 안 된다.** 8개월 대조에서
-- 3개월이 부호 반대였다(2026-04: 예탁원 −$0.47B vs TIC +$15.11B). 둘은 다른 것을 잰다 —
-- TIC net transactions 는 원천이 "연준 스태프 추정치가 섞였다"고 밝힌 **잔고 분해 추정값**
-- 이고, 이 표는 국내 **결제 실측**이다(대신 예탁원을 안 거치는 기관 거래는 안 잡힌다).
-- 규모·역사·국가비교는 TIC, 실제 매매 흐름은 이 표로 나눠 쓴다.
--
-- Supabase SQL Editor에서 실행하세요.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 일별 외화증권 결제 (예탁결제원)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 미국만 담지 않고 **국가별로 전부** 담는다. "해외주식 매수 중 미국이 몇 %인가"가
-- 이 표에서 가장 센 카드인데, 그건 분모(전체)가 있어야 나온다. 하루 25행이라
-- 32년을 다 담아도 30만 행 언저리다.
--
-- 금액과 함께 **건수**를 담는 게 중요하다. 금액만으로는 "돈이 커진 것"과 "사람이 는 것"을
-- 못 가른다 — 실측으로 2020→2025 에 건수는 3.2배인데 1건당 금액은 7% 늘었을 뿐이다.

create table if not exists public.seohak_settlement_daily (
  settle_date   date not null,
  market_code   text not null,
  market_name   text not null,
  security_type text not null,
  buy_count     bigint,
  buy_amount    numeric,
  sell_count    bigint,
  sell_amount   numeric,
  updated_at    timestamptz not null default now(),
  primary key (settle_date, market_code, security_type)
);

comment on table public.seohak_settlement_daily is
  '한국예탁결제원 국제거래 외화증권 예탁결제 현황(공공데이터포털 금융위 오픈API). 결제일 기준 일별이고 거래일 대비 T+1 영업일이다(휴장일 실측으로 확정). ⚠️ 제2유형 — 출처 표시 필수 · 상업적 이용 금지';
comment on column public.seohak_settlement_daily.settle_date is
  '결제일(frcrScrtDpsgStlDt). 거래일이 아니다 — 거래일로 환산하려면 1영업일을 뺀다';
comment on column public.seohak_settlement_daily.market_code is
  '시장 국가 코드(scrsMrktNtnlDcd). 미국은 US. 국가가 아닌 값도 섞인다(유로클리어·클리어스트림 같은 국제예탁기관, 심천홍콩증시연계 같은 연계 시장)';
comment on column public.seohak_settlement_daily.security_type is
  '유가증권 구분명(scrsDcdNm). 주식·채권 등. 화면의 서학개미 지표는 전부 주식만 쓴다';
comment on column public.seohak_settlement_daily.buy_count is
  '매수 결제 건수. ⭐ 금액과 함께 봐야 "돈이 커진 것"과 "사람이 는 것"이 갈린다';
comment on column public.seohak_settlement_daily.buy_amount is
  '매수 결제 금액(달러). 원천이 소수점을 주므로 numeric 으로 둔다';

create index if not exists seohak_settlement_daily_market_idx
  on public.seohak_settlement_daily (market_code, security_type, settle_date desc);

alter table public.seohak_settlement_daily enable row level security;

create policy "seohak_settlement_daily_public_read"
  on public.seohak_settlement_daily
  for select
  to anon, authenticated
  using (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 역방향 순매수 칸을 seohak_country_flows 에 더한다
-- ─────────────────────────────────────────────────────────────────────────────
--
-- '격차가 사라지고 있습니다' 카드가 지금은 배수만 말한다. 정작 흥미로운 건 원인인데,
-- 실측하면 2024-12 → 2026-05 에 미국인은 한국 주식을 **순매도(−$16.2B)** 했고 늘어난
-- $559.9B 의 대부분이 평가액이었다(같은 기간 코스피 2,399 → 8,476). 그 문장을 화면에
-- 쓰려면 역방향 순매수가 있어야 한다.
--
-- FRED 시리즈 USLTEQTYNET{국가코드} 로 받는다(fetch_seohak_flows.py 의 SERIES_PREFIX).

alter table public.seohak_country_flows
  add column if not exists us_net_purchase_usd_mn bigint;

comment on column public.seohak_country_flows.us_net_purchase_usd_mn is
  '역방향 순매수 — 미국 거주자가 그 나라 주식을 그 달에 순매수한 금액(백만 달러). 음수면 순매도. us_holdings 증감에서 주가 상승분을 걷어내는 데 쓴다';
