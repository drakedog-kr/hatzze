-- Hatzze — 마이그레이션 028: '관심의 폭'(N개 채널)을 미리 세어 둔다 (카더라 리포트)
--
-- 화면에서 이 값이 나오는 자리는 둘이다.
--   · 주요 종목 리포트 카드   "언급 1,002회 · 163개 채널"
--   · 급부상 종목 카드        "45개 채널"
-- 뜻은 한 가지 — 최근 KADERA_WINDOW_DAYS(3일) 안에 그 종목을 언급한 **서로 다른 채널 수**.
--
-- 왜 비싼가: telegram_message_stocks 에는 날짜가 없다(메시지 PK만 갖는다). 기간으로
-- 자르려면 telegram_messages 에 !inner 조인해 posted_at 을 봐야 하고, 그걸 **종목마다
-- 따로** 한다. 한 페이지에 10번(리포트 4 + 급부상 6)이다.
--
-- 실측(2026-08-07 콜드 트레이스): 이 조인 9왕복의 소요 합이 **22,386ms**, 웜에서는 931ms.
-- 페이지에서 단일 최대 항목이다.
--
-- **캐싱이 아니라 계산을 옮기는 것이다**(마이그레이션 023·027 과 같은 성격). 창이 이미
-- 얼어 있어서 그렇다 — 프론트는 벽시계가 아니라 kaderaBaseDate(telegram_sentiment_daily
-- 의 최신 날짜)로 창을 잡는다. 파이프라인이 돌기 전까지 답이 상수인데 매 방문이 그
-- 상수를 다시 만들고 있었다. 표시 값은 한 글자도 안 달라진다.
--
-- ⭐ **순위는 저장하지 않는다. 채널 수만 종목코드로 저장한다.**
-- 급부상 카드 전체를 저장하는 안도 있었지만 접었다. 그러면 (a) 순위 로직 사본이
-- TS·common/surging.py·저장값 셋이 되고, (b) common/surging.py 가 창을 벽시계로 잡는
-- 문제를 먼저 고쳐야 한다(그쪽 docstring 은 "프론트를 그대로 따랐다"고 적혀 있지만
-- 실제로는 datetime.now() 를 쓴다). 채널 수만 옮기면 프론트의 순위 로직을 한 줄도
-- 안 건드리고, 창도 latest 에서 직접 잡아 그 문제와 무관해진다.
--
-- 저장 대상은 창 안 언급 상위 BREADTH_TOP_N 종목이다. 화면이 쓰는 건 10개지만 넉넉히
-- 둬야 순위가 조금 달라져도 폴백이 안 걸린다. 없는 종목은 프론트가 예전처럼 즉석에서
-- 센다(그리고 그 사실을 로그에 남긴다).
--
-- window_start·window_end 를 함께 두는 이유: 프론트가 **자기가 원하는 창과 같은지
-- 확인하고** 쓰기 위해서다. 파이프라인이 하루 밀려 창이 어긋난 날 낡은 숫자를 그대로
-- 내보내면, 그건 느린 것보다 나쁘다.
--
-- ※ 다른 telegram_* 와 동일하게 비공개(RLS 켜되 공개 read 정책 없음).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_stock_breadth (
  stock_code text primary key references public.stocks (code) on delete cascade,
  channel_count integer not null,
  window_start date not null,
  window_end date not null,
  computed_for date not null,
  updated_at timestamptz not null default now()
);

comment on table public.telegram_stock_breadth is
  '종목별 관심의 폭(창 안 서로 다른 채널 수). 렌더마다 조인해 세지 않도록 파이프라인이 미리 계산해 둔다';
comment on column public.telegram_stock_breadth.channel_count is
  'window_start~window_end(양끝 포함, KST) 에 이 종목을 언급한 서로 다른 channel_handle 수';
comment on column public.telegram_stock_breadth.window_start is
  '센 창의 시작일. 프론트가 자기 창과 같은지 확인하고 쓴다 — 다르면 직접 센다';

create index if not exists telegram_stock_breadth_window_idx
  on public.telegram_stock_breadth (window_start, window_end);

alter table public.telegram_stock_breadth enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 다른 telegram_* 와 동일.
