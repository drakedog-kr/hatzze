-- Hatzze — 마이그레이션 088: 카더라 낙관도를 '시장 전체를 말한 글'로 센다
--
-- ## 무엇을 고치나
--
-- 카더라 헤드라인 낙관도가 79일 동안 한 번도 '비관 우세'를 찍지 않았다(국장·미장 둘 다).
-- 코스피가 07-01 8,303 → 09-28 6,890 으로 17% 빠지는 동안 내린 날 22일 중 12일이 낙관이었다.
-- 원인은 **종목이 붙은 글**(회사 소식·특징주·리포트)이다. 수주·계약 같은 호재가 대부분이라
-- 78일 내내 낙관도 61~90이었고, 헤드라인이 이걸 합쳐 세서 끌려 올라갔다(2026-09-29 실측).
--
-- 그래서 글마다 "국내 증시 전체 / 미국 증시 전체에 대해 무엇을 말하나"를 따로 묻고,
-- 헤드라인·3분할 막대·30일 추이·총평 인용을 그 답으로 센다. 테마 막대는 예전 톤 그대로다.
-- 판정은 scripts/analyze_telegram_market.py 가 하고, 날짜별 집계도 같은 스크립트가 적는다.
--
-- ## 표 둘
--
--   telegram_message_market          글 하나의 시장 판정. 후보 낱말에 걸린 글만 묻는다(전체의 45% 안팎).
--     kr / us   positive · neutral · negative · none(시장 전체 이야기가 아님)
--     kind      news · research · opinion · auto (글 종류. 지금은 기록만 하고 계산에 안 쓴다)
--     posted_date / text_hash   날짜별로 셀 때 같은 날 같은 본문을 한 번만 세려고 같이 적는다
--
--   telegram_market_sentiment_daily  날짜 × 시장(kr·us)의 낙관·중립·비관 건수. 화면·총평이 읽는다
--
-- ⚠️ 이 표가 없거나 비어 있으면 화면·총평은 예전처럼 전체 글 기준으로 센다. 파이프라인도 안내만
--    찍고 넘어간다. 그래서 코드와 이 마이그레이션의 순서는 상관없지만, 먼저 실행해 둘 것.
--    실행한 뒤에는 지난 날짜를 채워야 30일 추이가 새 기준으로 이어진다(PR 본문의 백필 명령).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_message_market (
  id uuid primary key default gen_random_uuid(),
  channel_handle text not null,
  message_id bigint not null,
  posted_date date not null,
  text_hash text,
  kr text not null check (kr in ('positive', 'neutral', 'negative', 'none')),
  us text not null check (us in ('positive', 'neutral', 'negative', 'none')),
  kind text not null check (kind in ('news', 'research', 'opinion', 'auto')),
  model text not null,
  analyzed_at timestamptz not null default now(),
  unique (channel_handle, message_id),
  foreign key (channel_handle, message_id)
    references public.telegram_messages (channel_handle, message_id) on delete cascade
);

create index if not exists telegram_message_market_posted_date_idx
  on public.telegram_message_market (posted_date);
create index if not exists telegram_message_market_analyzed_at_idx
  on public.telegram_message_market (analyzed_at);

comment on table public.telegram_message_market is
  '글 하나가 국내·미국 증시 전체에 대해 전하는 분위기. scripts/analyze_telegram_market.py 가 적는다';
comment on column public.telegram_message_market.kr is
  '국내 증시 전체(코스피·코스닥·시장 전체 수급)에 대한 분위기. none 은 시장 전체 이야기가 아님';
comment on column public.telegram_message_market.us is
  '미국 증시 전체(S&P500·나스닥·다우·월가)에 대한 분위기. none 은 시장 전체 이야기가 아님';
comment on column public.telegram_message_market.posted_date is '글이 올라온 날(KST)';

alter table public.telegram_message_market enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 옆 표들과 같다.

create table if not exists public.telegram_market_sentiment_daily (
  date date not null,
  market text not null check (market in ('kr', 'us')),
  positive_count integer not null default 0,
  neutral_count integer not null default 0,
  negative_count integer not null default 0,
  message_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (date, market)
);

comment on table public.telegram_market_sentiment_daily is
  '날짜 × 시장별로 시장 전체를 말한 글의 낙관·중립·비관 건수(같은 날 같은 본문은 한 번). 카더라 헤드라인 낙관도가 읽는다';

alter table public.telegram_market_sentiment_daily enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 옆 표들과 같다.
