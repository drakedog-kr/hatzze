-- Hatzze — 마이그레이션 071: 국장 배당 이력 (배당주 페이지 재료)
--
-- 배당주 페이지(성향별 바스켓 + 보유 종목 계산기)가 읽는 표다. 배당금은 여기서, 현재가는
-- `stocks.close_price`(KRX 전일 종가, 매일 갱신)에서 읽는다. 배당수익률 = 최근 12개월
-- 배당금 합 ÷ 현재가. 종가 이력은 안 쌓는다 — 화면이 역사를 안 보여주기로 했다(2026-09-11).
--
-- ## 원천 — 공공데이터포털 금융위원회_주식배당정보 (예탁결제원)
--
-- 국내 발행사 전부의 배당 기록이 1985년부터 한 줄씩 온다(2026-09-11 실측 71,683행).
-- 상장 여부를 안 가리고 다 담는다 — 7만 행이라 작고, 상장폐지된 종목의 이력도 남는다.
--
-- ⚠️⚠️ **1주당 금액 칸(stckGenrDvdnAmt)은 당시 액면 기준 명목값이다. 액면분할이 소급되지
--    않는다.** 삼성전자 2017년 결산이 21,500원으로 온다(2018년 50:1 분할 전 값).
--    반면 `배당률(stckGenrCashDvdnRt)` 은 당시 액면 대비 % 이고 `액면가(stckParPrc)` 는
--    **지금** 액면이라, 액면가 × 배당률 ÷ 100 이 분할 소급된 1주당 배당금이 된다
--    (같은 행에서 100 × 430 ÷ 100 = 430원 = 21,500 ÷ 50). 그래서 `cash_per_share` 는
--    이 계산값이고, 원천의 명목값은 `cash_per_share_nominal` 로 따로 둔다.
--    증가율·연속 배당·최근 12개월 합은 **반드시 `cash_per_share`** 로 잴 것.
--    ⚠️ 액면가가 0 인 발행사(215행)는 계산이 안 돼 명목값을 그대로 넣는다.
-- ⚠️ `cash_rate_pct` 는 **액면가 대비** 배당률이지 시장 배당수익률이 아니다. 삼성전자가
--    566% 로 온다. 화면에 그대로 내면 안 된다.
-- ⭐ 기준일이 **미래**인 행도 온다(2026-09-11 실측: 11-23 까지). "다가오는 배당기준일"은
--    따로 안 만들어도 이 표에서 나온다.
-- ⚠️ 원천은 날짜별 증분이 아니라 **매일 스냅숏 하나**를 통째로 준다(`basDt` 가 최신
--    영업일 하나뿐이고 옛 날짜는 0행). 수집기는 매일 전량(15페이지)을 다시 받아 upsert 한다.
-- ⭐ `무배당` 행이 따로 있다. 배당을 안 준 해를 셀 때 "행이 없다"가 아니라 이걸로 센다.
-- ⭐ 우선주는 같은 발행사 아래 `share_kind = 우선주·2우선주…` 행으로 온다.
-- ⭐ 리츠도 들어 있다(법인명이 `…부동산투자회사`). ETF 는 없다.
--
-- ⚠️ 이용허락범위 제2유형 — **출처표시 + 상업적 이용금지.** KRX 와 같은 상자다.
--
-- ⚠️ 번호 071 은 2026-09-11 기준으로 비어 있던 것이다(원격 브랜치·워크트리 전부 확인).
--    머지 직전에 origin/main 을 다시 볼 것.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.kr_dividend (
  isin                    text not null,
  record_date             date not null,
  code                    text not null,
  issuer_name             text not null,
  security_name           text,
  share_kind              text,
  kind                    text not null,
  cash_per_share          numeric,
  cash_per_share_nominal  numeric,
  cash_rate_pct           numeric,
  par_value               numeric,
  stock_dividend_ratio    numeric,
  pay_date                date,
  stock_delivery_date     date,
  fiscal_month            text,
  diff_cash_rate_pct      numeric,
  snapshot_date           date not null,
  updated_at              timestamptz not null default now(),
  primary key (isin, record_date)
);

comment on table public.kr_dividend is
  '예탁결제원 배당 기록(공공데이터포털 금융위원회_주식배당정보). 국내 발행사 전부, 1985년부터. ⚠️ 제2유형 — 출처표시 + 상업적 이용금지';
comment on column public.kr_dividend.code is
  '6자리 단축코드. ISIN 에서 유도한다 — 앞 5자리는 그대로, 6번째 자리는 0→0(보통주)·1→5·2→7·3→9, 영문(K·L·M)은 그대로. stocks.code 와 이어진다';
comment on column public.kr_dividend.record_date is
  '배당기준일(dvdnBasDt). 결산 배당은 대개 12-31 이지만 2024년부터 2~4월로 옮긴 회사가 많다(배당절차 개선)';
comment on column public.kr_dividend.kind is
  '현금배당 · 무배당 · 동시배당(현금+주식) · 주식배당. ⭐ 무배당 행이 따로 있으니 배당 안 준 해는 이걸로 센다';
comment on column public.kr_dividend.cash_per_share is
  '1주당 현금배당금(원), **액면분할 소급**. 액면가 × cash_rate_pct ÷ 100 으로 계산한 값이다. 증가율·이력은 이 칸으로. 액면가 0 이면 명목값을 그대로 둔다';
comment on column public.kr_dividend.cash_per_share_nominal is
  '원천의 1주당 현금배당금(stckGenrDvdnAmt). **당시 액면 기준 명목값이라 분할 전 해는 지금 눈금과 다르다**(삼성전자 2017 = 21,500). 화면에 쓰지 말 것';
comment on column public.kr_dividend.cash_rate_pct is
  '액면가 대비 현금배당률(%). ⚠️ 시장 배당수익률이 아니다(삼성전자 566%). 수익률은 최근 12개월 cash_per_share 합 ÷ stocks.close_price 로 잰다';
comment on column public.kr_dividend.stock_dividend_ratio is
  '주식배당 비율(1주당 신주 수). 동시배당·주식배당 행에서만 0 이 아니다';
comment on column public.kr_dividend.pay_date is
  '현금배당 지급일. "어느 달에 입금되나" 달력의 재료. 무배당 행은 비어 있다';
comment on column public.kr_dividend.diff_cash_rate_pct is
  '차등배당 현금배당률(%). 대주주와 소액주주에게 다르게 준 경우의 다른 쪽 값. 1,035행뿐이라 참고용';
comment on column public.kr_dividend.snapshot_date is
  '이 행을 받은 원천 스냅숏 날짜(basDt). 전량을 매일 다시 받으므로 정상이면 최신 영업일이다';

create index if not exists kr_dividend_code_idx
  on public.kr_dividend (code, record_date desc);
create index if not exists kr_dividend_record_date_idx
  on public.kr_dividend (record_date desc);
create index if not exists kr_dividend_pay_date_idx
  on public.kr_dividend (pay_date desc);

alter table public.kr_dividend enable row level security;

create policy "kr_dividend_public_read"
  on public.kr_dividend
  for select
  to anon, authenticated
  using (true);
