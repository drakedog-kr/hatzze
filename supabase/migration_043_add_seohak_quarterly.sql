-- Hatzze — 마이그레이션 043: 기관과 나머지의 분기 성적표
--
-- `seohak_institution_13f` 는 23,356행이다. 화면이 이걸 통째로 읽으면 방문 한 번에
-- 2MB 가 나간다 — [[project_supabase_free_tier_capacity]] 에서 digest 한 줄이 월
-- 10GB 를 먹던 것과 같은 형태다. 접은 결과만 이 표에 둔다(분기당 1행, 지금 8행).
--
-- ## 두 수익률은 서로 다른 방법으로 낸다. 같은 방법을 못 쓴다
--
-- **기관** — 13F 는 종목별 수량과 평가액을 주므로 `평가액 ÷ 수량` 으로 그 분기 말
-- 단가가 역산된다. 앞 분기 수량을 고정하고 이번 분기 단가로 다시 매기면 매매 효과가
-- 빠진 순수 보유 수익률이 나온다. ⭐ 역산 단가를 실제 종가와 대조해 확인했다
-- (2024-09-30 TSLA $261.30 / 실제 $261.63 · NVDA $121.35 / $121.44 · AMZN $186.35 / $186.33).
--
-- **전체** — TIC 은 종목이 없고 잔고와 순매수만 있다. 그래서 폐합식을 쓴다:
-- `r = (잔고 − 앞잔고 − 순매수) ÷ 앞잔고`. 잔고는 실측이고 순매수만 추정이라
-- 잔차가 수익 쪽으로 흡수돼 닫힌다(코호트 카드가 쓰는 것과 같은 방법).
--
-- ⚠️⚠️ **분기 하나만 떼서 보면 안 된다.** TIC 순매수는 원천이 "연준 스태프 추정치가
-- 섞였다"고 밝힌 분해값이라, 크게 오른 분기에 수익을 거래로 흡수해 전체 수익률을
-- 낮춰 잡는다(2025Q2 나스닥 +17.8% 인데 폐합식은 +7.15%). 오차는 방향이 랜덤이라
-- **누적하면 상쇄된다** — 7분기 복리 +20.89% vs 같은 구간을 한 번에 닫으면 +22.21%.
-- 그래서 화면은 **누적**을 크게 쓰고 분기별은 곡선의 마디로만 보여준다.
--
-- ## ⚠️ 이 표에 담기는 '기관'은 한국 기관 전부가 아니다
--
-- SEC 에 13F 를 내는 한국 소재 기관 9곳뿐이다(운용자산 $100M 이상 + 미국 상장주식
-- 보유 시 의무). 보험사·중소 운용사·직접 투자하는 법인은 안 잡힌다. 그래서
-- `institution_value_usd` 는 '기관 몫의 하한'이고, 나머지는 '개인'이 아니라
-- **'이 9곳이 아닌 전부'** 다. 화면 문구가 이걸 흐리면 안 된다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.seohak_quarterly_returns (
  quarter_end        date primary key,
  institution_usd    numeric,
  total_usd          numeric,
  institution_share  numeric,
  institution_return numeric,
  total_return       numeric,
  rest_return        numeric,
  overlap_count      integer,
  filer_count        integer,
  updated_at         timestamptz not null default now()
);

comment on table public.seohak_quarterly_returns is
  '분기별 한국 기관(SEC 13F 9곳) 대 한국 전체(미 재무부 TIC)의 보유 수익률. calculate_seohak_quarterly.py 가 매 실행 덮어쓴다. ⚠️ 분기 하나만 떼서 읽지 말 것 — TIC 순매수 추정 오차가 분기 단위에서 크다';
comment on column public.seohak_quarterly_returns.institution_usd is
  '13F 9곳의 그 분기 말 평가액 합(달러). suspect 로 표시된 줄은 뺀 값이다';
comment on column public.seohak_quarterly_returns.institution_share is
  'institution_usd ÷ total_usd. 실측 26.6~34.6% 로 안정적이다. ⚠️ 13F 를 내는 9곳만 세므로 기관 몫의 하한이다';
comment on column public.seohak_quarterly_returns.institution_return is
  '앞 분기 보유수량을 고정하고 이번 분기 역산 단가로 다시 매긴 수익률. 앞 분기와 겹치는 종목만 쓴다(overlap_count)';
comment on column public.seohak_quarterly_returns.total_return is
  '폐합식 (잔고 − 앞잔고 − 순매수) ÷ 앞잔고. TIC 월별을 분기로 접어 쓴다';
comment on column public.seohak_quarterly_returns.rest_return is
  '기관을 뺀 나머지의 수익률. (전체 − 기관몫 × 기관수익률) ÷ (1 − 기관몫). ⚠️ ''개인''이 아니라 ''13F 를 내는 9곳이 아닌 전부'' 다';
comment on column public.seohak_quarterly_returns.filer_count is
  '그 분기에 제출한 기관 수. ⚠️ 5곳 미만이면 아직 다 안 낸 분기다(13F 마감이 분기말 +45일). 화면은 그런 분기를 빼고 그린다';

alter table public.seohak_quarterly_returns enable row level security;

create policy "seohak_quarterly_returns_public_read"
  on public.seohak_quarterly_returns
  for select
  to anon, authenticated
  using (true);
