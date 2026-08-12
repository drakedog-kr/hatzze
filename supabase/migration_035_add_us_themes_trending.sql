-- Hatzze — 마이그레이션 035: 미장 테마 로테이션 + 트렌딩 메시지
--
-- 국내 짝: migration_0xx(telegram_theme_daily) + migration_029(telegram_trending_message).
--
-- ## 또 표를 나눈다 (migration_034 와 같은 이유)
--
-- 034 에서 국내 센티먼트 표에 미장 행을 얹으려다, 그 표의 `scope` 를 프론트가
-- "overall 이 아니면 전부 테마"로 읽는 걸 발견해 표를 갈랐다. 여기도 같다 —
-- `telegram_theme_daily` 에 미국 테마를 넣으면 국장 테마 로테이션 카드에 'AI반도체'가
-- 끼어들고, `telegram_trending_message` 에 미국 메시지를 넣으면 국장 트렌딩 목록에
-- 섞인다. 두 표 다 **시장을 가르는 컬럼이 없다.**
--
-- 판단 규칙으로 굳혀 둔다: **컬럼을 재사용하기 전에 그 값을 읽는 쪽의 필터를 볼 것.**
-- "빈 컬럼이 있다"는 "그 컬럼이 내가 쓰려는 뜻이다"가 아니다.
--
-- Supabase SQL Editor에서 실행하세요.

-- ── 일별 테마 집계 ──────────────────────────────────────────────────────────
-- 사전은 config/us_stock_themes.py (16테마 · 티커 178개 전부 배정).
-- ⚠️ 국내 사전은 키가 **종목명**인데 이쪽은 **티커**다. 미국 종목의 한글 표기는
--    원본이 파이썬 파일이라 흔들릴 수 있고("알파벳"/"구글"), 티커는 안 흔들린다.
create table if not exists public.telegram_us_theme_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  theme text not null,
  mention_count integer not null default 0,
  weighted_score numeric not null default 0,
  share_pct numeric not null default 0,
  stock_count integer not null default 0,
  rank smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (date, theme)
);

comment on table public.telegram_us_theme_daily is
  '일별 미국 테마 주목도. 국내는 telegram_theme_daily 로 따로 있다 — 한 표에 섞으면 국장 테마 로테이션에 미국 테마가 끼어든다';
comment on column public.telegram_us_theme_daily.share_pct is
  '그날 **미국 종목 전체** 주목도 합 대비 비중. 절대량으로 두면 주말에 전 테마가 일제히 줄어 날짜 간 비교가 안 된다';
comment on column public.telegram_us_theme_daily.stock_count is
  '그날 그 테마에서 실제로 언급된 종목 수. 한 종목이 테마 전체를 끌고 가는 날을 가려낸다';
comment on column public.telegram_us_theme_daily.rank is
  '그날 share_pct 순위. 주간 순위 변동은 프론트가 날짜 간 rank 를 견주어 구한다';

create index if not exists tg_us_theme_daily_date_idx
  on public.telegram_us_theme_daily (date desc, rank);

alter table public.telegram_us_theme_daily enable row level security;


-- ── 트렌딩 메시지 ───────────────────────────────────────────────────────────
-- migration_029 와 같은 모양. 다른 건 `stocks` 배열에 국내 종목명이 아니라 **미국 종목의
-- 한글 표기**가 들어간다는 것뿐이다.
--
-- 이 표가 있는 이유는 캐싱이 아니라 **계산을 옮기는 것**이다(029 주석과 같다).
-- 창마다 조회수 상위 200건을 받아 점수로 다시 줄 세워야 하는데, 그걸 렌더 시점에 하면
-- 국내에서 세 창 합 11초가 나왔다. telegram_messages 는 파이프라인이 돌 때만 바뀌므로
-- 실행 사이에 이 목록은 상수다.
create table if not exists public.telegram_us_trending_message (
  window_key text not null,
  rank smallint not null,
  channel_handle text not null,
  message_id bigint not null,
  text text not null,
  views integer not null default 0,
  forwards integer not null default 0,
  replies integer not null default 0,
  posted_at timestamptz not null,
  stocks text[] not null default '{}',
  window_start timestamptz not null,
  computed_for date not null,
  updated_at timestamptz not null default now(),
  primary key (window_key, rank)
);

comment on table public.telegram_us_trending_message is
  '미국 종목을 언급한 메시지 중 창별 상위 목록. 국내는 telegram_trending_message';
comment on column public.telegram_us_trending_message.window_key is
  '화면 탭과 일대일 — today · w7 · w30';
comment on column public.telegram_us_trending_message.stocks is
  '그 메시지에 붙은 **미국** 종목의 한글 표기(최대 3개). 국내 종목은 여기 안 들어간다 — 같이 붙이면 국장 카드와 구분이 사라진다';
comment on column public.telegram_us_trending_message.window_start is
  '창의 시작 시각. 화면이 "언제부터"를 말할 때 쓴다';

alter table public.telegram_us_trending_message enable row level security;
