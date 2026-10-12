-- Hatzze — 마이그레이션 095: 국내 상장 ETF 기본 정보 (ETF 자금 흐름 화면 '같은 지수, 어떤 ETF' 비교표)
--
-- 같은 지수를 따르는 ETF 끼리 견줄 때 KRX 일별매매정보(etf_flow_daily)에 없는 칸 — 총보수 · 설정일 · 운용사 · 공식 분류 —
-- 을 ETF 하나에 한 줄로 둔다.
--
-- ## 원천 — 예탁원 세이브로 'ETF종합정보'(BIP_CNTS06032V)
--
-- 배당 화면이 분배금을 받는 곳(BIP_CNTS06030V)과 같은 WebSquare 서비스다. ISIN 하나를 주면 그 ETF 의 기본 정보가 온다
-- (task ksd.safe.bip.cnts.etf.process.EtfCompstInfoPTask · action compstInfoSecnDetailList). 2026-10-11 실측:
-- KODEX 200 총보수 0.15% · TIGER 미국S&P500 0.0068%. 바뀌는 일이 드물어 주 단위로 다시 받는다.
-- 채우는 쪽은 `data-pipeline/scripts/fetch_etf_info.py`.
--
-- ⚠️ 총보수는 세이브로가 주는 운용보수(TOT_RECM_RATE)다. 기타 비용까지 더한 실부담비용과는 다르다.
-- ⚠️ 공개 화면의 공시 사실을 옮기는 것이고 출처(한국예탁결제원)는 투자 유의사항(/disclaimer) '데이터 출처'에 적는다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.etf_info (
  code         text primary key,
  isin         text not null,
  name         text not null,
  manager      text,
  fee_pct      numeric,
  setup_date   date,
  category     text,
  benchmark    text,
  updated_at   timestamptz not null default now()
);

comment on table public.etf_info is
  '국내 상장 ETF 기본 정보(예탁원 세이브로 ETF종합정보). ETF 자금 흐름 화면 비교표가 읽는다';
comment on column public.etf_info.code is '단축코드(etf_flow_daily.isu_cd 와 같은 값)';
comment on column public.etf_info.isin is 'ISIN(KR7 + 단축코드 + 00 + 체크숫자)';
comment on column public.etf_info.fee_pct is '총보수(연 %, 세이브로 TOT_RECM_RATE). 실부담비용 아님';
comment on column public.etf_info.setup_date is '설정일(SETUP_DT)';
comment on column public.etf_info.category is '세이브로 분류(ETF_BIG_SORT_NM) — 예: 시장지수/코스피200 · 해외지수/해외지수 · 파생상품/레버리지';
comment on column public.etf_info.benchmark is '운용사 표준 벤치마크 문구(MNGCO_STD_FUND_BCHMRK_CONTENT)';

alter table public.etf_info enable row level security;

create policy "etf_info_public_read"
  on public.etf_info
  for select
  to anon, authenticated
  using (true);
