-- Hatzze — 마이그레이션 064: 급부상 종목 카드의 한 줄 요약 (국장·미장)
--
-- 급부상 종목 카드에 "왜 뜨는지" 한 줄을 붙인다. 주요 종목 리포트의 흐름 요약
-- (telegram_stock_narrative.narrative, 75~80자)과는 **다른 글**이다.
--
-- ## 왜 기존 표에 컬럼을 더하지 않고 표를 나누나
--
-- `telegram_stock_narrative.narrative` 가 **not null** 이다. 급부상 카드에 서는 종목은
-- 주목도 상위 6개 밖인 날이 많아(그게 '급부상'의 뜻이다) 그 표에 행이 아예 없다.
-- 한 줄만 있는 행을 넣으려면 narrative 의 not null 을 풀어야 하는데, 그 제약은
-- **커버리지 검사가 기대는 자리**다 — 요약이 빈 채로 카드에 나가는 사고를 두 번
-- 겪고 세운 규칙이라(generate_telegram_narratives.py 머리 주석) 풀면 안 된다.
--
-- 034·035·036 이 세운 판단 규칙과 같다: **컬럼을 재사용하기 전에 그 값을 읽는 쪽의
-- 필터를 볼 것.** 읽는 쪽이 다르고(카드가 다르다) 생기는 조건도 다르면 표를 나눈다.
--
-- ## 국장·미장을 또 나누는 이유
--
-- 036 과 같다. 국장은 6자리 종목코드가 `stocks` 를 참조하고, 미장은 라틴 티커가
-- `us_stocks` 를 참조한다. 한 컬럼에 섞으면 "6자리 코드"를 가정한 곳이 전부
-- 잠재 버그가 된다.
--
-- Supabase SQL Editor에서 실행하세요.

-- ── 국장 ────────────────────────────────────────────────────────────────────
create table if not exists public.telegram_surging_oneliner (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  stock_code text not null references public.stocks (code),
  oneliner text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (date, stock_code)
);

comment on table public.telegram_surging_oneliner is
  '급부상 종목 카드의 한 줄 요약(LLM). 주요 종목 리포트의 흐름 요약(telegram_stock_narrative)과 다른 글이다 — 그 표는 narrative 가 not null 이라 급부상 전용 행을 못 넣는다';
comment on column public.telegram_surging_oneliner.oneliner is
  '왜 뜨는지 한 줄, 22~30자. 카드 폭이 좁아(1440에서 안쪽 324px · 13px 한글 26자/줄) 30자를 넘기면 두 줄이 되고 카드 높이가 어긋난다';
comment on column public.telegram_surging_oneliner.date is
  '집계 기준일. 화면이 이 날짜로 문장을 집는다 — 그날 실행이 실패하면 옛 문장이 오늘 숫자 옆에 붙지 않도록';

create index if not exists tg_surging_oneliner_date_idx
  on public.telegram_surging_oneliner (date desc);

alter table public.telegram_surging_oneliner enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 옆 표들과 같다.


-- ── 미장 ────────────────────────────────────────────────────────────────────
create table if not exists public.telegram_us_surging_oneliner (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  ticker text not null references public.us_stocks (ticker),
  oneliner text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (date, ticker)
);

comment on table public.telegram_us_surging_oneliner is
  '미장 급부상 종목 카드의 한 줄 요약(LLM). 국내 짝은 telegram_surging_oneliner';
comment on column public.telegram_us_surging_oneliner.oneliner is
  '왜 뜨는지 한 줄, 22~30자. 국내와 같은 눈금이다';

create index if not exists tg_us_surging_oneliner_date_idx
  on public.telegram_us_surging_oneliner (date desc);

alter table public.telegram_us_surging_oneliner enable row level security;
