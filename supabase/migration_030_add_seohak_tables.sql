-- Hatzze — 마이그레이션 030: 서학개미 해부도의 두 표
--
-- 이 페이지가 답해야 하는 질문은 "미국 시장 안에서 한국 돈이 어떻게 움직이는가"다.
-- 원천을 고르는 데 오래 걸렸으므로 왜 이 둘인지를 남긴다.
--
-- ## 왜 예탁결제원이 아닌가
--
-- 처음 설계는 예탁원 외화증권 보관금액에 전부 매달려 있었다. 그런데 **종목별**은
-- SEIBro 오픈플랫폼에만 있고 그건 법인 전용 + 원래 유료다. 공공데이터포털의
-- 금융위 API(GetDrForeSecuSettInfoService_V2)는 무료·일별이지만 국가/시장 단위
-- 합계라 종목별이 아니고, 이용허락범위가 **제2유형(출처표시 + 상업적 이용금지)**
-- 이라 수익화와 부딪힌다.
--
-- ## 그래서 반대편에서 본다
--
-- 미 재무부 TIC 은 거래상대방의 **법적 거주지** 기준으로 집계한다. 즉 "한국 거주자가
-- 든 미국 주식"이 미국 쪽 통계로 이미 존재한다. 한국 쪽 문이 잠겼다고 데이터가 없는
-- 게 아니었다. 게다가 TIC 은 미 정부 저작물이라 재배포 제약이 없다 — 야후·KRX·예탁원
-- 셋 다 걸려 있는 제약에서 유일하게 자유롭다.
--
-- 두 표가 서로 다른 해상도를 담당한다:
--   seohak_country_flows  국가 단위 · 월별 · 1984년부터   ← 규모와 흐름
--   seohak_institution_13f 종목 단위 · 분기별 · 기관 한정  ← 무엇을 샀나
--
-- ⚠️ **종목별 '개인' 비중은 어떤 공개 원천으로도 안 나온다.** 미국 거래소는 국적별
-- 거래대금을 공표하지 않고, 13F 는 기관만이며, 예탁원 종목별은 위와 같이 막혀 있다.
-- 화면에서 "이 종목의 한국인 비중"을 말하면 안 된다. 13F 는 반드시 **기관 이름과
-- 함께** 표시해 개인 보유로 오해되지 않게 한다.
--
-- Supabase SQL Editor에서 실행하세요.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 국가별 월별 흐름 (미 재무부 TIC · FRED 경유)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 보유잔액만 두지 않고 **순매수와 평가변동을 나란히** 두는 게 이 표의 핵심이다.
-- 잔액은 "더 샀기 때문"과 "오르기만 했기 때문"을 구분하지 못한다. 실측(2026-05
-- 기준 직전 12개월) 한국의 잔액 증가 $245.9B 중 순매수는 $77.2B(31%)뿐이었고,
-- 2026-02 는 잔액이 줄어든 달인데 그중 순매수가 **마이너스**(=순매도)였다.
-- 두 칸을 따로 저장해야 그 문장이 화면에서 나온다.

create table if not exists public.seohak_country_flows (
  country_code    text  not null,
  month           date  not null,
  holdings_usd_mn         bigint,
  net_purchase_usd_mn     bigint,
  valuation_change_usd_mn bigint,
  us_holdings_usd_mn      bigint,
  updated_at      timestamptz not null default now(),
  primary key (country_code, month)
);

comment on table public.seohak_country_flows is
  '미 재무부 TIC(CSLT)의 국가별 미국 주식 보유·거래. FRED 시리즈로 받는다(FORLTEQTYPOS/NET/VALCHG + USLTEQTYPOS). 단위는 원천 그대로 백만 달러이며, 원화 환산은 표시 시점에 한다 — 환율을 저장해 두면 나중에 환율 정의를 바꿀 때 저장값이 거짓이 된다';
comment on column public.seohak_country_flows.country_code is
  'TIC 국가 코드. 한국 43001 · 일본 42609 · 중국 41408 · 대만 46302 · 홍콩 42005 · 싱가포르 46019 · 영국 13005. FRED 시리즈 ID 의 접미사와 같다';
comment on column public.seohak_country_flows.month is
  '해당 월의 1일. 원천이 월말 잔액을 월 시작일에 붙여 발표한다';
comment on column public.seohak_country_flows.holdings_usd_mn is
  '그 나라 거주자가 보유한 미국 주식 잔액(백만 달러). 개인과 기관이 섞여 있고 분리 시리즈는 없다';
comment on column public.seohak_country_flows.net_purchase_usd_mn is
  '그 달의 순매수(백만 달러). 음수면 순매도다. **이 칸이 이 표를 만든 이유다** — 잔액 증감에서 주가 상승분을 걷어낸 "실제로 새로 넣은 돈"';
comment on column public.seohak_country_flows.valuation_change_usd_mn is
  '그 달 잔액 변화 중 평가액 변동분(백만 달러). net_purchase 와 더하면 대체로 잔액 증감이 되지만 완전히 일치하진 않는다(원천이 잔차를 별도로 둔다). 화면에서 "합이 딱 맞는다"고 쓰지 말 것';
comment on column public.seohak_country_flows.us_holdings_usd_mn is
  '역방향 — 미국 거주자가 보유한 **그 나라** 주식 잔액(백만 달러). 한국은 2021-06 에 역전돼(한국인의 미국주식 > 미국인의 한국주식) 지금까지 유지 중이다';

alter table public.seohak_country_flows enable row level security;

create policy "seohak_country_flows_public_read"
  on public.seohak_country_flows
  for select
  to anon, authenticated
  using (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 한국 기관의 미국 주식 보유 (SEC 13F)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- EDGAR 전문검색의 locationCodes=M5(한국)로 제출자를 뽑는다. 목록을 코드에 박지 않고
-- 매 실행 다시 뽑는 이유는, 새 기관이 13F 대상($1억)에 올라오거나 빠지는 걸 사람이
-- 눈치채야만 반영되는 구조를 피하려는 것이다.
--
-- 한 제출에서 같은 CUSIP 이 여러 줄로 나뉘어 나온다(투자재량 구분). 실측으로
-- 국민연금 2026-03-31 은 562행 / 고유 557종목이었다. 화면은 종목 단위이므로
-- **CUSIP 으로 합산해서** 저장한다 — 프론트가 매번 합치지 않게.
--
-- ⚠️ 13F 에는 티커가 없다. CUSIP 과 발행사명뿐이다. ticker 는 별도 매핑을 붙일 때를
-- 위해 열어 두되, 없어도 화면이 서야 한다(종목 로고는 티커가 필요하므로 없으면 폴백).

create table if not exists public.seohak_institution_13f (
  filer_cik    text   not null,
  filer_name   text   not null,
  report_date  date   not null,
  cusip        text   not null,
  issuer       text   not null,
  ticker       text,
  value_usd    bigint not null,
  shares       bigint,
  suspect      boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (filer_cik, report_date, cusip)
);

comment on table public.seohak_institution_13f is
  '한국 소재 기관이 SEC 에 신고한 미국 주식 보유(13F-HR). **기관이다. 개인이 아니다** — 화면에 그릴 때 반드시 기관명을 함께 보여 서학개미 개인 보유로 오해되지 않게 할 것. 분기말 기준이고 제출은 45일까지 늦어진다';
comment on column public.seohak_institution_13f.filer_cik is
  'SEC CIK(앞자리 0 포함 문자열로 둔다 — 숫자로 저장하면 0 이 날아간다)';
comment on column public.seohak_institution_13f.report_date is
  '분기말(3/31·6/30·9/30·12/31). 제출일이 아니다';
comment on column public.seohak_institution_13f.cusip is
  '9자리 CUSIP. 13F 가 종목을 가리키는 유일한 키다';
comment on column public.seohak_institution_13f.value_usd is
  '평가액(달러). 원천은 2022년 이후 달러 단위로 신고하지만 그 이전 제출은 **천 달러 단위**라 소급 수집할 땐 배율을 확인할 것';
comment on column public.seohak_institution_13f.shares is
  '주식 수. 원천에 주식/옵션 구분이 있는데 여기선 주식만 담는다';
comment on column public.seohak_institution_13f.suspect is
  '⭐ 원문 오류 의심 제출. 실측(2026-08-10): 미래에셋 2026-03-31 이 버크셔 Class A 368,452주(=Class A 총 발행의 3분의 2, $264.6B)를 신고해 제출 총액이 직전 분기 $36.0B 에서 $299.3B 로 튀었다. **제출자가 신고한 tableValueTotal 도 똑같이 틀려서 그걸로는 못 잡는다** — 종목 50개 이상인데 한 종목이 50%를 넘으면 참으로 둔다. 이 플래그가 켜진 제출은 합계·순위에서 빼고, 종목별로 보여줄 땐 표시를 붙일 것';

create index if not exists seohak_institution_13f_report_idx
  on public.seohak_institution_13f (report_date desc, value_usd desc);

alter table public.seohak_institution_13f enable row level security;

create policy "seohak_institution_13f_public_read"
  on public.seohak_institution_13f
  for select
  to anon, authenticated
  using (true);
