-- Hatzze — 마이그레이션 079: 배당의 확정값과 과세되는 몫
--
-- 배당으로 살기(/dividend) 피드백 셋(2026-09-17)에 답하는 자료다.
--   1. 국내 ETF 분배금은 전액이 과세되지 않는다. 운용사가 지급 건마다 '과표'(과세되는 1주당 금액)를 공시한다 —
--      TIGER 200 커버드콜 88원 중 5원. 예탁원 SEIBro 는 과표기준가만 주고 과표는 안 준다(기준가 차이로 계산하면
--      공시값과 안 맞는다, 실측). 그래서 운용사 사이트에서 받아 etf_dividend.payments 의 건마다 taxable 로 싣고
--      지난 1년 합을 taxable_dps 로 둔다. 과표를 못 받은 운용사는 null(화면은 전액 과세로 센다).
--   2. 국내 주식의 확정 배당 — 회사가 이사회에서 정한 다음 배당(1주당 금액·기준일·지급예정일)은 거래소 '현금·현물배당
--      결정' 공시에 있다. 예탁원 기록은 지급 뒤에 오고 미래 기준일엔 금액이 대부분 비어 있다.
--   3. 감액배당(자본준비금 감액 재원, 상장사 소액주주 비과세) — 같은 공시 본문에 글로 적혀 있다. 공식 칸은 없다.
--
--   새 표 kr_dividend_notice  — 공시 한 건 한 행(data-pipeline/scripts/fetch_kr_dividend_notices.py, 매일 최근 열흘)
--   kr_dividend_stock 열 넷   — 공시에서 계산한 종목별 값(calculate_kr_dividend_stats.py 가 채운다)
--   etf_dividend 열 하나      — 지난 1년 과표 합(fetch_etf_dividends.py)
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.kr_dividend_notice (
  acptno          text primary key,
  corp_prefix     text not null,
  corp_name       text not null,
  filed_at        timestamptz not null,
  title           text not null,
  corrected       boolean not null default false,
  div_kind        text,
  div_type        text,
  dps_common      numeric,
  dps_pref        numeric,
  record_date     date,
  pay_date        date,
  decided_on      date,
  taxfree         boolean not null default false,
  taxfree_amount  numeric,
  taxfree_note    text,
  doc_url         text not null,
  updated_at      timestamptz not null default now()
);

comment on table public.kr_dividend_notice is
  'KIND 현금·현물배당 결정 공시(서식 61500) 한 건 한 행. 확정 배당(1주당 금액·기준일·지급예정일)과 감액배당 문장의 원천';
comment on column public.kr_dividend_notice.corp_prefix is 'KIND 가 주는 회사 코드 앞 5자리. 보통주 코드 = 이 값 + 0, 우선주는 같은 5자리에 5·7·9';
comment on column public.kr_dividend_notice.corrected is '[정정] 공시. 같은 회사·기준일에 여러 건이면 acptno 가 큰 것이 최신';
comment on column public.kr_dividend_notice.div_kind is '결산배당 · 분기배당 · 중간배당';
comment on column public.kr_dividend_notice.dps_pref is '종류주식(우선주) 1주당 배당금. 서식의 첫 종류주식 값';
comment on column public.kr_dividend_notice.taxfree is '본문에 자본준비금(감액) 재원 + 비과세 문장이 같이 있으면 true. 안 적은 회사는 false 라 놓치는 쪽은 있어도 잘못 붙는 쪽은 없다';
comment on column public.kr_dividend_notice.taxfree_amount is '일부만 감액배당일 때 그 1주당 금액. null 이면 전액';
comment on column public.kr_dividend_notice.taxfree_note is '감액배당이라고 적은 문장(400자까지). 화면 툴팁이 그대로 보인다';

create index if not exists kr_dividend_notice_prefix_record_idx on public.kr_dividend_notice (corp_prefix, record_date);

alter table public.kr_dividend_notice enable row level security;

create policy "kr_dividend_notice_public_read"
  on public.kr_dividend_notice
  for select
  to anon, authenticated
  using (true);

alter table public.kr_dividend_stock add column if not exists taxfree_dps numeric;
alter table public.kr_dividend_stock add column if not exists taxfree_note text;
alter table public.kr_dividend_stock add column if not exists next_pay_date date;
alter table public.kr_dividend_stock add column if not exists next_pay_amount numeric;

comment on column public.kr_dividend_stock.taxfree_dps is '지난 12개월 배당(ttm_dps) 가운데 감액배당으로 공시된 몫(원). 공시에 비과세라고 적은 회사만 잡힌다';
comment on column public.kr_dividend_stock.taxfree_note is '그 공시의 감액배당 문장. 화면 툴팁';
comment on column public.kr_dividend_stock.next_pay_date is '공시된 다음 배당의 지급예정일. 공시가 지급일을 안 적었으면 null 이고 next_pay_amount 만 있다';
comment on column public.kr_dividend_stock.next_pay_amount is '공시된 다음 배당의 1주당 금액(원) — 확정값. 예탁원의 next_record_date 와 같은 기준일 건';

alter table public.etf_dividend add column if not exists taxable_dps numeric;

comment on column public.etf_dividend.taxable_dps is '지난 1년 지급 건의 과표(과세되는 1주당 금액) 합. 운용사가 공시한 값이라 받은 운용사(TIGER)만 있고 나머지는 null(화면은 전액 과세로 센다)';
comment on column public.etf_dividend.payments is '지난 1년에 지급된 건 [{record, pay, amount, taxable?}]. 국내는 예탁원 SEIBro(taxable 은 운용사 공시), 미국은 stockanalysis. 달력이 쓴다';
