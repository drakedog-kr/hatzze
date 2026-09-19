-- Hatzze — 마이그레이션 080: 테마 리포트(/theme/[테마])의 '요즘 무슨 얘기' · 함께 언급된 테마 · 발췌
--
-- 테마 하나를 두고 채널에서 요즘 무슨 얘기가 도는지를 **파이프라인이 하루 한 번 써 둔다.**
-- 만드는 곳: data-pipeline/scripts/generate_theme_briefs.py (총평·종목 요약 다음 스텝).
-- 읽는 곳: lib/theme-page.ts (getThemePage).
--
-- 한 행에 세 가지가 같이 든다. 셋 다 같은 메시지 묶음(최근 사흘 · 이 테마 종목이 태그된 글)에서
-- 나오므로 한 번에 만들고 한 번에 읽는다.
--
--   brief     LLM 두세 문장. null = 그 기간에 이 테마 종목이 언급된 글이 없어 요약할 것이 없다
--             (그것도 화면에 그대로 적는다 — "없다"와 "아직 안 만들었다"는 다른 말이다).
--   related   같은 글에 함께 나온 다른 테마. [{"theme": "통신", "messages": 12}, …] — 가격이 아니라
--             언급으로 묶인 이웃이다. 화면은 이걸 다른 테마 사이트의 '다음에 올 테마'(예측) 대신
--             '함께 언급되는 테마'(사실)로 낸다.
--   excerpts  조회가 많은 글 다섯. [{"channel_handle", "message_id", "posted_at", "views", "forwards",
--             "text", "stocks": [종목명…]}, …]. 본문을 여기 **복사해 둔다** — 렌더 때 telegram_messages 를
--             조인해 고르면 태그가 드문 테마에서 statement timeout 에 걸린다(lib/theme-page.ts 머리말).
--
-- ⚠️ 공개 read 정책을 두지 않는다. 다른 telegram_* 표와 같이 서버(service_role)만 읽는다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_theme_brief (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  theme text not null,
  brief text,
  related jsonb not null default '[]'::jsonb,
  excerpts jsonb not null default '[]'::jsonb,
  message_count integer not null default 0,
  stock_count integer not null default 0,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, theme)
);

comment on table public.telegram_theme_brief is
  '테마 리포트의 요즘 무슨 얘기(LLM)·함께 언급된 테마·발췌. 최근 사흘 창, 테마마다 하루 한 행. generate_theme_briefs.py 가 쓴다';
comment on column public.telegram_theme_brief.brief is
  'LLM 두세 문장(합쇼체). null = 그 기간에 이 테마 종목이 언급된 글이 없다';
comment on column public.telegram_theme_brief.related is
  '같은 글에 함께 나온 다른 테마와 그런 글의 수. [{"theme","messages"}] 상위 몇 개';
comment on column public.telegram_theme_brief.excerpts is
  '조회가 많은 글의 본문 사본. 렌더 때 조인하지 않으려고 여기 둔다(lib/theme-page.ts)';
comment on column public.telegram_theme_brief.message_count is
  '창 안에서 이 테마 종목이 태그된 글 수(복붙 포함)';
comment on column public.telegram_theme_brief.stock_count is
  '창 안에서 언급된 이 테마 종목 수';

create index if not exists tg_theme_brief_theme_date_idx on public.telegram_theme_brief (theme, date desc);

alter table public.telegram_theme_brief enable row level security;
