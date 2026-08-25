-- 개별 애널리스트가 낸 의견 — 누가 · 어느 증권사에서 · 언제 · 무엇을
--
-- 052 의 컨센서스가 "62명이 매수"라고만 말한다면, 이건 "8월 20일에 어느 증권사가
-- 하향했다"까지 말한다. 같은 원천(stockanalysis.com)의 `/stocks/{티커}/ratings/` 다.
--
-- ## ⚠️⚠️ 종목당 **최근 5건만** 담는다 — 약관 때문이다
--
-- 원천 약관: "전문 재게시는 허락 없이 금지, **발췌**는 수정하지 않고 출처를 밝히면 허용."
-- 저쪽은 종목마다 최근 8건을 싣는데, 그걸 179종목에 통째로 옮기면 발췌가 아니라 재게시다.
-- 그래서 다섯 건에서 끊고, 화면에 **원문 페이지 링크**를 함께 단다 — 일부만 인용하고
-- 나머지는 원문으로 보내는 모양이라야 한다.
--
-- ⛔ 애널리스트 적중률·순위 점수(`scores`)는 **안 가져온다.** 원천이 함께 주지만 그건
--    명백히 그쪽 유료 상품의 핵심이라 발췌로 볼 수 없다.
--
-- ## ⚠️ 이전 등급은 원천에 없다
--
-- 저쪽 payload 에 `rating_old` 칸이 있지만 **상향·하향에서도 늘 빈 문자열**이다(실측).
-- 방향은 `action`("Upgrades"·"Downgrades")에만 있고, 목표가만 이전 값(`pt_old`)이 온다.
-- 빈 칸을 담아 두면 나중에 "왜 안 채워지지"를 다시 파게 된다.
--
-- ## ⚠️ 키가 넷이라 드물게 뭉갤 수 있다
--
-- 이름이 없는 줄이 "Unknown Analyst" 로 온다. 같은 증권사에서 같은 날 이름 없는 의견이
-- 둘 나오면 한 줄로 합쳐진다. 실측으로는 못 봤고, 합쳐지더라도 최신 5건 표시에는 영향이
-- 거의 없다. 늘어나면 seq 를 키에 더할 것.
--
-- ## ⚠️ us_stocks 에 외래키를 걸지 않는다
--
-- `extract_telegram_us_stocks.py` 가 매 실행 us_stocks 를 통째로 덮어써서, 종목이
-- 빠지는 순간 이 표의 적재가 통째로 실패한다. 049·051·052 가 같은 이유로 FK 를 뺐다.

create table if not exists public.us_analyst_action (
  ticker text not null,
  -- 원천이 주는 의견 날짜. ⚠️ 우리가 받은 날이 아니다(052 와 반대다).
  action_date date not null,
  -- 이름이 없으면 "Unknown Analyst" 로 온다. 원문 그대로 담는다.
  analyst text not null,
  firm text not null,
  -- "Buy" · "Hold" · "Sell" · "Strong Buy" 등. 원문 그대로 담고 화면에서 옮긴다.
  rating_new text,
  -- "Maintains" · "Reiterates" · "Upgrades" · "Downgrades" · "Initiates".
  action text,
  target_now numeric,
  -- 목표가를 바꾼 경우에만 이전 목표가가 온다.
  target_old numeric,
  currency text,
  updated_at timestamptz not null default now(),
  primary key (ticker, action_date, firm, analyst)
);

comment on table public.us_analyst_action is
  '개별 애널리스트의 등급·목표가 의견. stockanalysis.com 에서 종목당 최근 5건만 발췌하며, 화면은 출처와 원문 링크를 함께 낸다';
comment on column public.us_analyst_action.action_date is
  '⚠️ 원천이 주는 의견 날짜다. 052(us_analyst_consensus)의 as_of_date 는 우리가 받은 날이라 뜻이 다르다';
comment on column public.us_analyst_action.action is
  '⚠️ 등급이 바뀐 방향은 여기에만 있다. 원천의 rating_old 는 상향·하향에서도 늘 빈 문자열이라 안 담았다';

create index if not exists idx_us_analyst_action_ticker
  on public.us_analyst_action (ticker, action_date desc);

-- ⚠️ 정책은 만들지 않는다. 화면은 서비스 키(`getSupabaseAdmin`)로 읽어 RLS 를 우회하고,
--    브라우저에 나가는 anon 키로는 아무것도 못 읽는 상태가 맞다. 045~052 가 같은 모양이다.
alter table public.us_analyst_action enable row level security;
