-- Hatzze — 마이그레이션 036: 미장 총평 + 미국 종목 흐름 요약 (LLM 문장 두 자리)
--
-- 국내 짝: telegram_daily_brief · telegram_stock_narrative.
--
-- ## 세 번째로 표를 나눈다 (034·035 와 같은 이유)
--
-- `telegram_daily_brief` 는 (date) 하나가 기본키라 시장을 가를 자리가 아예 없고,
-- `telegram_stock_narrative` 는 (date, stock_code) 인데 stock_code 가 `stocks` 를
-- 참조하는 6자리 코드다 — 티커를 넣을 수 없다.
--
-- 판단 규칙(034 에서 세운 것)이 여기서도 그대로 답을 준다:
-- **컬럼을 재사용하기 전에 그 값을 읽는 쪽의 필터를 볼 것.**
--
-- Supabase SQL Editor에서 실행하세요.

-- ── 오늘의 요약(총평) ───────────────────────────────────────────────────────
-- 세 대목을 빈 줄(\n\n)로 이어 한 칼럼에 넣는다. 프론트가 그 빈 줄로 쪼개 문단을 만든다.
-- 국내와 같은 어법이라 화면 컴포넌트도 같은 규칙으로 읽는다.
create table if not exists public.telegram_us_daily_brief (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  sentiment_summary text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.telegram_us_daily_brief is
  '미장 카더라 오늘의 요약(LLM 3대목). 국내는 telegram_daily_brief — 그 표는 (date) 가 유일키라 시장을 가를 자리가 없다';
comment on column public.telegram_us_daily_brief.sentiment_summary is
  '세 대목을 빈 줄로 이은 통글. ① 분위기 ② 테마 지형 ③ 오간 이야기(국내로 옮겨붙은 것 포함)';
comment on column public.telegram_us_daily_brief.date is
  '집계 기준일. 화면이 이 날짜로 문장을 집는다 — 그날 실행이 실패하면 옛 문장이 오늘 숫자 옆에 붙지 않도록';

alter table public.telegram_us_daily_brief enable row level security;


-- ── 미국 종목 흐름 요약 ─────────────────────────────────────────────────────
-- ⚠️ 국내 표(telegram_stock_narrative)는 stock_code 가 6자리 숫자다. 티커는 1~5자
--    라틴이라 한 컬럼에 섞으면 "6자리 코드"를 가정한 곳이 전부 잠재 버그가 된다
--    (migration_033 에서 us_stocks 를 따로 판 것과 같은 이유).
create table if not exists public.telegram_us_stock_narrative (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  ticker text not null references public.us_stocks (ticker),
  narrative text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (date, ticker)
);

comment on table public.telegram_us_stock_narrative is
  '미국 종목별 흐름 요약(LLM). 화면의 주요 종목 리포트가 이 표를 그대로 읽는다 — 요약이 없는 종목은 카드에 빈칸으로 나간다';
comment on column public.telegram_us_stock_narrative.narrative is
  '최근 사흘 그 종목이 어떻게 회자됐는지 75~80자. 카드 높이가 이 길이에 맞춰져 있다';

create index if not exists tg_us_stock_narrative_date_idx
  on public.telegram_us_stock_narrative (date desc);

alter table public.telegram_us_stock_narrative enable row level security;
