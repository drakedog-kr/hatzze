-- Hatzze — 마이그레이션 032: 예탁원 결제 통계의 연도별 롤업
--
-- ## 왜 표를 하나 더 두나
--
-- seohak_settlement_daily 은 32년 × 하루 25행이라 25만 행이다. "해외주식 매수 중
-- 미국 비중" 카드는 그 전체를 봐야 나오는 값인데, **매 렌더가 25만 행을 읽으면**
-- 예전에 Egress 를 태운 그 전량조회가 된다(월 18.3GB 를 만든 7곳과 같은 형태다).
--
-- 그래서 파이프라인이 미리 접는다. 32행이라 조회가 사실상 공짜고, 원자료가 그대로
-- 남아 있어 언제든 다시 만들 수 있다. **캐싱이 아니라 계산을 옮기는 것이다** —
-- 실행과 실행 사이에 이 값은 얼어붙은 입력에 대한 순수 함수라, 미리 계산해도 화면
-- 값이 한 글자도 안 달라진다(마이그레이션 023 과 같은 동기).
--
-- ## 왜 연도별인가 (월별이 아니라)
--
-- 월별이면 384행으로 선이 매끄럽지만, 1990년대는 한 달 매수가 $1M 도 안 되는 달이
-- 섞여 비중이 0%와 100% 사이를 튄다 — 그림이 아니라 잡음이 된다. 연도별은 그 잡음이
-- 눌리고, 이 카드가 하려는 말("1996년 0.3% → 2026년 94.1%")의 눈금과도 맞는다.
--
-- ## 무엇을 담나
--
-- 금액과 **건수를 함께** 담는다. 이 표가 답하는 질문이 둘이라서다:
--   ① 어느 시장으로 갔나        → 비중(금액)
--   ② 돈이 커진 건가, 사람이 는 건가 → 건수와 1건당 금액
-- 실측(2020 → 2025): 건수는 3.2배인데 1건당 금액은 7% 늘었다. 금액만 담으면 이
-- 문장이 아예 안 나온다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.seohak_settlement_yearly (
  year                 smallint primary key,
  us_buy_amount        numeric,
  us_sell_amount       numeric,
  us_buy_count         bigint,
  us_sell_count        bigint,
  all_stock_buy_amount numeric,
  second_market_code   text,
  second_market_name   text,
  second_buy_amount    numeric,
  trading_days         smallint,
  excluded_markets     text[],
  updated_at           timestamptz not null default now()
);

comment on table public.seohak_settlement_yearly is
  'seohak_settlement_daily 을 연도로 접은 것. calculate_seohak_yearly.py 가 만든다(평소엔 올해만, --all 이면 전 구간). 주식만 담는다 — 채권은 이 화면의 어느 카드도 안 쓴다. 이 표가 비어도 원자료가 남아 있으므로 언제든 재생성할 수 있다';
comment on column public.seohak_settlement_yearly.all_stock_buy_amount is
  '그 해 **모든 시장** 주식 매수 합(달러). 미국 비중의 분모다. 유로클리어·클리어스트림 같은 국제예탁기관과 심천홍콩증시연계 같은 연계 시장도 포함한다 — 원천이 그 단위로 집계하고, 어느 것도 "해외 주식을 산 것"이라는 사실은 같다';
comment on column public.seohak_settlement_yearly.second_market_name is
  '⭐ 그 해 미국 **다음으로** 매수가 많았던 시장. 이 칸이 이 표에서 가장 이야기가 되는 자리다 — 1996년 일본 → 2000년 인도네시아 → 2004년 유로클리어 → 2008~2020년 홍콩 → 2024년 이후 일본으로 바뀐다. 쏠림의 대상이 30년간 어떻게 갈아탔는지가 한 칸에 담긴다';
comment on column public.seohak_settlement_yearly.excluded_markets is
  '⚠️ 분모에서 **뺀** 시장 목록. 1996~2002년 일부 기록은 금액이 달러가 아니라 결제 통화로 실린 것으로 보인다 — 1999년 인도네시아가 55건에 $49.07B(1건당 $8.9억)인데, 그해 한국 GDP 가 $4,900억이라 성립하지 않는다. 엔·루피아로 읽으면 1건당 금액이 정상 범위로 돌아온다.
   판정은 **1건당 매수액 > $10M**. 자의적이지 않다: 전 구간 187개 시장-연도의 중앙값이 $39,469 이고 미국은 역대 최대가 1999년 $1,003,960 인데, 이 문턱을 넘는 건 7개뿐이고 전부 1996~2002년 일본·인도네시아다.
   이 칸이 비어 있지 않은 해는 화면에서 비중을 단정하지 말 것';
comment on column public.seohak_settlement_yearly.trading_days is
  '그 해 자료가 있는 결제일 수. 연도별 값을 견줄 때 분모가 다른지(상장 첫해·올해 진행 중) 확인하는 데 쓴다';

alter table public.seohak_settlement_yearly enable row level security;

create policy "seohak_settlement_yearly_public_read"
  on public.seohak_settlement_yearly
  for select
  to anon, authenticated
  using (true);
