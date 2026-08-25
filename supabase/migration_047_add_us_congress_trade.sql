-- Hatzze — 마이그레이션 047: 미 하원의원 주식 매매(STOCK Act 정기 거래 보고)
--
-- 내부자 리포트(/insider)의 마지막 축이다. 세 축 가운데 **카더라와 가장 잘 겹친다.**
--
-- ## ⭐ 왜 이 축이 중요한가
--
-- 실측(2026-08-19, 하원 PTR 70건을 파싱): 주식 거래 860건 중 **220건(26%)이 카더라에
-- 오른 종목**이었다. 65종목이 겹치고, MSFT·AAPL·AMZN·NVDA·GOOGL·PLTR 처럼 우리 채널이
-- 실제로 떠드는 이름들이다.
--
-- 임원(Form 4)은 대형주에서 장내 매수가 1~2% 라 빈약하고, 13F 는 분기 자료라 안 움직인다.
-- **사람이 재량으로 한 매매가 우리 종목에 실제로 쌓이는 건 이 축뿐이다.**
--
-- ## ⚠️⚠️ 티커는 소괄호, 대괄호는 자산유형 코드다
--
--   Chevron Corporation Common Stock (CVX) [ST]   ← CVX 가 티커, ST 는 Stock
--   Treasury Bill (3-Month) [GS]                   ← GS 는 Government Security. **골드만삭스가 아니다**
--
-- 대괄호를 티커로 읽으면 국채 매매가 골드만삭스 매매로 둔갑한다. 실제로 처음 뽑은 공시가
-- 그 형태였다. 자산유형 코드표: fd.house.gov/reference/asset-type-codes.aspx
--
-- ## ⚠️ 금액은 구간뿐이다
--
-- STOCK Act 이 구간 신고만 요구한다($1,001~$15,000 식). 정확한 금액은 어떤 경로로도
-- 안 나온다. 그래서 low/high 를 그대로 담는다 — 가운데값을 만들어 담으면 없는 정밀도를
-- 지어내는 것이고, 화면이 그걸 합산하면 거짓 숫자가 된다.
--
-- ## ⚠️ 최대 45일 늦다
--
-- 거래 인지 후 30일, 늦어도 45일 안에 신고한다. transaction_date 와 filed_date 가
-- 그만큼 벌어진다. 화면은 **둘 다** 들고 있어야 한다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.us_congress_trade (
  doc_id text not null,
  seq integer not null,
  ticker text not null references public.us_stocks (ticker),
  member text not null,
  state_dst text,
  transaction_type text,
  transaction_date date,
  notification_date date,
  amount_low numeric,
  amount_high numeric,
  filed_date date not null,
  source_url text,
  updated_at timestamptz not null default now(),
  primary key (doc_id, seq)
);

comment on table public.us_congress_trade is
  '미 하원의원의 주식 매매 신고(STOCK Act PTR). us_stocks 에 있는 종목만 담는다 — 국채·펀드·부동산은 버린다';
comment on column public.us_congress_trade.doc_id is
  '하원 공시 문서 번호. 8자리는 전자제출(PDF 에 텍스트 층이 있다), 7자리는 스캔이라 OCR 이 필요하다';
comment on column public.us_congress_trade.transaction_type is
  'P=매수 · S=매도 · E=교환. "(partial)" 이 붙는 매도는 일부 매도다';
comment on column public.us_congress_trade.amount_low is
  '⚠️ 제도상 **구간**이다. 가운데값을 만들어 담지 말 것 — 없는 정밀도를 지어내는 것이고, 합산하면 거짓 숫자가 된다';
comment on column public.us_congress_trade.transaction_date is
  '⚠️ 실제 매매일. filed_date 와 최대 45일 벌어진다(제도가 그렇게 허용한다). 화면은 둘 다 적어야 한다';

create index if not exists us_congress_trade_ticker_idx
  on public.us_congress_trade (ticker, transaction_date desc);
create index if not exists us_congress_trade_filed_idx
  on public.us_congress_trade (filed_date desc);

alter table public.us_congress_trade enable row level security;
