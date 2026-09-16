-- Hatzze — 마이그레이션 076: ETF 분배금에 다음 지급 건을 붙인다
--
-- 국내 ETF 분배금의 원천을 TIGER 연간 표에서 '전체 분배 내역'(지급 건마다 기준일·지급일·금액)으로
-- 바꿨다(data-pipeline/scripts/fetch_etf_dividends.py). 그래서 국내 ETF 도 지급 달이 생겨 달력에 들고,
-- `payments` 에 기준일(record)이 함께 실린다 — 열은 그대로다(jsonb). 새 열은 미국 주식(075)과 같은
-- '선언됐지만 아직 안 지급된 다음 건' 둘뿐이다. 미국 ETF 는 stockanalysis 가 주고, 국내는 원천에
-- 미래 건이 안 실려 당분간 비어 있다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.etf_dividend add column if not exists next_pay_date date;
alter table public.etf_dividend add column if not exists next_pay_amount numeric;

comment on column public.etf_dividend.next_pay_date is '선언됐지만 아직 안 지급된 다음 건의 지급일(미국 ETF). 국내는 원천에 미래 건이 없어 비어 있다';
comment on column public.etf_dividend.payments is '지난 1년에 지급된 건 [{record, pay, amount}]. 국내는 TIGER 분배 내역, 미국은 stockanalysis. 달력이 쓴다';
comment on column public.etf_dividend.ttm_dps is '지난 365일에 지급된 건의 합(원 또는 달러)';
