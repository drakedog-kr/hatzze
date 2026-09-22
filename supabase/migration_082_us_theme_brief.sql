-- Hatzze — 마이그레이션 082: 미장 테마 리포트(/theme/us/[테마])의 '요즘 도는 얘기' · 함께 언급된 테마 · 발췌 · 급부상 종목
--
-- 국장 짝은 telegram_theme_brief(마이그레이션 080 + 081). 열이 같다 — 화면(lib/us-theme-page.ts)이 국장과
-- 같은 타입으로 읽어 같은 뷰(app/theme/ThemeDetailView.tsx)를 그린다. 다른 점은 셋뿐이다.
--   theme    config/us_stock_themes.py 의 열여섯 테마 이름(AI반도체 · 메모리 …)
--   excerpts stocks 에 미국 종목의 한글 표기(us_stocks.name_ko)
--   riser    code 에 6자리 코드가 아니라 **티커**, market 은 늘 "US"
-- 창도 미장 규칙이다 — 기준일(telegram_us_sentiment_daily 최신일)을 **포함한** 3일(국장은 기준일을 뺀 3일).
-- 만드는 곳: data-pipeline/scripts/generate_us_theme_briefs.py (미장 총평·종목 요약 다음 스텝).
--
-- ⚠️ 공개 read 정책을 두지 않는다. 다른 telegram_us_* 표와 같이 서버(service_role)만 읽는다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_us_theme_brief (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  theme text not null,
  brief text,
  related jsonb not null default '[]'::jsonb,
  excerpts jsonb not null default '[]'::jsonb,
  message_count integer not null default 0,
  stock_count integer not null default 0,
  riser jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, theme)
);

comment on table public.telegram_us_theme_brief is
  '미장 테마 리포트의 요즘 도는 얘기(LLM)·함께 언급된 테마·발췌·급부상 종목. 기준일 포함 3일 창, 테마마다 하루 한 행. generate_us_theme_briefs.py 가 쓴다. 국장 짝은 telegram_theme_brief';
comment on column public.telegram_us_theme_brief.brief is
  'LLM 두 문단(합쇼체). null = 그 기간에 이 테마 종목이 언급된 글이 없다';
comment on column public.telegram_us_theme_brief.related is
  '같은 글에 함께 나온 다른 미장 테마와 그런 글의 수. [{"theme","messages"}] 상위 몇 개';
comment on column public.telegram_us_theme_brief.excerpts is
  '조회가 많은 글의 본문 사본. [{"channel_handle","message_id","posted_at","views","forwards","text","stocks":[한글 표기…]}]';
comment on column public.telegram_us_theme_brief.riser is
  '3일 전 대비 언급이 가장 많이 는 종목 하나와 이유. {"code":티커,"name","market":"US","recent","prior","ratio","reason"} 또는 null. 고르는 규칙은 common/us_theme_risers.py';

create index if not exists tg_us_theme_brief_theme_date_idx on public.telegram_us_theme_brief (theme, date desc);

alter table public.telegram_us_theme_brief enable row level security;
