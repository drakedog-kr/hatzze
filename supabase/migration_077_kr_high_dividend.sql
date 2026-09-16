-- Hatzze — 마이그레이션 077: 고배당기업(배당소득 분리과세 대상) 목록
--
-- 2026~2028년 지급 배당 가운데 고배당기업(조세특례제한법 104조의27)의 배당은 2,000만원을 넘어도
-- 종합과세에 합치지 않고 분리과세(14·20·25·30%)를 신청할 수 있다. 어느 회사가 해당하는지는 회사가
-- '기업가치 제고 계획' 공시에 스스로 적고 KRX KIND 가 목록으로 모아 준다. 파이프라인이 매일 그 목록을
-- 그대로 옮긴다(data-pipeline/scripts/fetch_kr_high_dividend.py). 배당으로 살기 화면이 줄에 표시를 붙인다.
--
-- ⚠️ 판정하지 않는다. 목록에 없다고 요건 미달이 아니라 공시를 안 한 것일 수 있다.
-- ⚠️ 국내 주식 직접 보유만. ETF·펀드·리츠·해외주식은 대상이 아니다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.kr_high_dividend (
  code              text primary key,
  name              text not null,
  corp_name         text not null,
  market            text,
  kind_id           text,
  disclosure_id     text,
  disclosure_title  text,
  biz_year          integer,
  settle_month      integer,
  payout_pct        numeric,
  div_growth_pct    numeric,
  computed_for      date not null,
  updated_at        timestamptz not null default now()
);

comment on table public.kr_high_dividend is
  'KIND 고배당기업 현황(배당소득 분리과세 대상, 2026~2028) — 회사가 기업가치 제고 계획 공시에 적은 것을 그대로. 매일 전량 교체';
comment on column public.kr_high_dividend.corp_name is 'KIND 의 법인명(케이티·삼성화재해상보험). name 은 종목명';
comment on column public.kr_high_dividend.disclosure_id is 'KIND 공시 접수번호. kind.krx.co.kr/common/disclsviewer.do?method=search&acptno=… 로 연다';
comment on column public.kr_high_dividend.payout_pct is '공시에 적힌 배당성향(%)';
comment on column public.kr_high_dividend.div_growth_pct is '공시에 적힌 이익배당금 증가율(%)';

alter table public.kr_high_dividend enable row level security;

create policy "kr_high_dividend_public_read"
  on public.kr_high_dividend
  for select
  to anon, authenticated
  using (true);
