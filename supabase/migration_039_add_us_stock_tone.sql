-- Hatzze — 마이그레이션 039: 미국 종목별 톤(낙관 ↔ 비관)
--
-- ⏸ **화면은 아직 없다.** 카드를 만들었다가 2026-08-12 에 걷었다(나중에 다시).
--    표는 파이프라인이 계속 채운다 — 되살릴 때 소급 집계가 필요 없고, 그때까지
--    날마다 목록이 어떻게 움직이는지가 쌓인다. 아래 설계 근거는 그대로 유효하다.
--
-- 미장 카더라의 '비관이 앞선 종목' 카드가 읽는다. 이 화면은 지금까지 낙관 쪽만
-- 보여주고 있었다 — 급부상·주요 종목·트렌딩이 전부 '많이 회자된 것'이라, 코퍼스가
-- 낙관 쪽으로 기운 만큼(판정 대비 비관 21%) 화면도 같이 기울었다.
--
-- ## ⚠️⚠️ 왜 메시지를 골라 세는가 — 시황 나열글이 40종목에 비관을 나눠 준다
--
-- "아마존·알파벳·엔비디아 상승 Vs. 애플·마이크론·샌디스크 하락" 같은 시황 요약글은
-- 메시지 **전체**가 negative 로 분류된다. 그런데 telegram_message_us_stocks 는 그 글에
-- 실린 종목을 전부 이어 두므로, **상승으로 적힌 종목까지 비관 한 표를 받는다.**
-- 실측으로 그런 글 한 건이 최대 40종목에 표를 뿌리고 있었다(30일 창).
--
-- 그대로 세면 순위가 뒤집힌다:
--
--   서비스나우   전체 56%  →  단독글만 16%
--   포드         전체 52%  →  단독글만 27%
--
-- 즉 '그 종목이 비관적으로 회자된 정도'가 아니라 '그날 시황글에 얼마나 자주 실렸나'를
-- 재고 있었다. 그래서 **미국 종목을 3개 이하로 말한 글만** 센다(MAX_TICKERS=3).
-- 30일 창에서 미국 언급 메시지의 86%가 3종목 이하라 표본은 넉넉하다.
--
-- ## 인용은 더 좁게 — **1종목 글**에서만
--
-- 3종목까지 열어 두고 가장 널리 퍼진 비관글을 뽑았더니 다섯 종목 중 둘이 '마감 시황'
-- 같은 시장 코멘트였다. 그 종목만 말한 글로 좁히면 5/5 가 제 얘기를 한다
-- (오라클 → CDS 프리미엄 사상 최고 · ASML → 중국 국산 DUV 노광장비).
--
-- ## 문턱
--
-- 판정(낙관+비관) 40건 이상. LLM 분류는 같은 입력을 다시 돌리면 낙관도가 흔들리므로
-- (실측 36%↔48%) 표본이 얇은 종목의 비율은 그대로 믿으면 안 된다. 40 에서 자격
-- 49종목 · 비관 우세 5종목이다.
--
-- 낙관 쪽도 같이 저장한다 — 이 표는 '비관 표'가 아니라 '종목별 톤'이다. 나중에
-- 반대편 카드를 만들 때 표를 새로 파지 않는다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_us_stock_tone (
  as_of_date date not null,
  window_days integer not null,
  ticker text not null references public.us_stocks (ticker),
  positive_count integer not null default 0,
  neutral_count integer not null default 0,
  negative_count integer not null default 0,
  mention_count integer not null default 0,
  -- 가장 널리 퍼진 비관글. 그 종목만 말한 글에서 고른다(위 주석). 없으면 null —
  -- 카드는 그 자리를 비우고 숫자만 낸다.
  top_negative_handle text,
  top_negative_message_id bigint,
  updated_at timestamptz not null default now(),
  primary key (as_of_date, window_days, ticker)
);

comment on table public.telegram_us_stock_tone is
  '창 안에서 그 미국 종목을 **3개 이하로** 말한 글의 톤 카운트. 시황 나열글은 뺀다 — 넣으면 상승으로 적힌 종목까지 비관표를 받는다(파일 머리 주석)';
comment on column public.telegram_us_stock_tone.as_of_date is
  '창의 끝점. 화면은 이 값으로 창을 고정해 읽는다 — 읽기 시점에 창을 다시 잡으면 파이프라인과 숫자가 갈린다';
comment on column public.telegram_us_stock_tone.negative_count is
  '⚠️ 비율은 중립을 뺀 낙관:비관으로 낸다. 같이 세면 시황·공시 같은 담담한 글이 절반이라 늘 비관으로 기운다';
comment on column public.telegram_us_stock_tone.top_negative_handle is
  '인용은 **그 종목만** 말한 글에서만 고른다. 3종목까지 열면 ''마감 시황'' 같은 시장 코멘트가 뽑힌다(5종목 중 2건 실측)';

create index if not exists tg_us_stock_tone_asof_idx
  on public.telegram_us_stock_tone (as_of_date desc, negative_count desc);

alter table public.telegram_us_stock_tone enable row level security;
