-- Hatzze — 마이그레이션 075: 미국 배당주에 지급일을 붙인다 (stockanalysis.com)
--
-- SEC XBRL 엔 지급일이 없어 미국 종목이 달력에서 빠져 있었다. stockanalysis.com 의 배당 내역
-- 페이지(주식·ETF 둘 다, 내부자 리포트의 컨센서스와 같은 원천·같은 약관)가 지급일과 금액을 준다.
-- 그래서 미국 주식의 12개월 배당은 이제 그 지급 건의 합(`ttm_dps`)이고, SEC 값은 `sec_ttm_dps` 로
-- 남겨 맞대어 본다(10% 넘게 갈리면 스크립트가 찍는다).
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.us_dividend_stock add column if not exists ttm_payments jsonb not null default '[]'::jsonb;
alter table public.us_dividend_stock add column if not exists pay_months jsonb not null default '[]'::jsonb;
alter table public.us_dividend_stock add column if not exists next_pay_date date;
alter table public.us_dividend_stock add column if not exists next_pay_amount numeric;
alter table public.us_dividend_stock add column if not exists sec_ttm_dps numeric;

comment on column public.us_dividend_stock.ttm_payments is
  '지난 1년에 지급된 건 [{pay, amount, ex}] (stockanalysis.com). 달력이 쓴다. 비어 있으면 그 페이지에 없는 종목';
comment on column public.us_dividend_stock.pay_months is '지급된 달 [4, 7, 10, 12]';
comment on column public.us_dividend_stock.next_pay_date is '선언됐지만 아직 안 지급된 다음 건의 지급일';
comment on column public.us_dividend_stock.sec_ttm_dps is 'SEC XBRL 로 낸 12개월 합(맞대어 보는 값). ttm_method 가 그 계산 방법';
