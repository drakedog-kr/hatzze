-- Hatzze — 마이그레이션 034: 미장 센티먼트 · 화제어 (미장 카더라)
--
-- 국내 쪽 짝: migration_0xx(telegram_sentiment_daily · telegram_keyword_daily) +
--             migration_023(telegram_issue_keyword).
--
-- ## ⛔ 왜 국내 표에 컬럼 하나 더하는 길을 안 갔나
--
-- 처음엔 `telegram_sentiment_daily` 에 미장 행을 얹으려 했다. **그러면 국장 화면이
-- 깨진다.** 그 표의 `scope` 는 `'overall' | 테마명` 이고, 프론트가 이렇게 읽는다:
--
--     lib/telegram-data.ts  .filter(([scope, a]) => scope !== "overall" && …)
--
-- 즉 `overall` 이 아닌 scope 는 **전부 테마로 간주**된다. 여기에 `'us'` 나
-- `'us_반도체'` 를 넣는 순간 국장 히어로의 '인기 테마별 비관↔낙관'에 그 값이
-- 테마인 척 끼어든다. 로컬 개발이 프로덕션 Supabase 를 그대로 보므로, 스크립트를
-- 손으로 한 번 돌리는 것만으로 프로덕션 화면에 가짜 테마가 뜬다.
--
-- 표를 나누면 그 위험이 0 이고, 국내 코드는 한 줄도 안 바뀐다.
-- `us_stocks` 를 `stocks` 에 안 섞은 것과 같은 판단이다(migration_033 주석).
--
-- ## 재료는 이미 다 있다
--
-- 미장 센티먼트는 **새로 분류하지 않는다.** `telegram_message_analysis` 의 톤·화제어는
-- 시장 중립이라 그대로 쓸 수 있고, "이 메시지가 미국 얘기인가"는
-- `telegram_message_us_stocks` 가 답한다. 실측으로 미국 언급 메시지 940건 중 932건
-- (99%)에 이미 분류가 붙어 있었다 — LLM 비용이 0 원이라는 뜻이다.
--
-- Supabase SQL Editor에서 실행하세요.

-- ── 일별 센티먼트 ───────────────────────────────────────────────────────────
-- scope 를 지금부터 넣어 두는 이유: 테마 로테이션(미국용 테마 사전)이 붙으면 국내와
-- 똑같이 `'overall' | 테마명` 두 층이 필요해진다. 그때 표를 또 고치지 않으려는 것이다.
-- 지금은 'overall' 한 값만 들어간다.
create table if not exists public.telegram_us_sentiment_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  scope text not null default 'overall',
  positive_count integer not null default 0,
  neutral_count integer not null default 0,
  negative_count integer not null default 0,
  message_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (date, scope)
);

comment on table public.telegram_us_sentiment_daily is
  '미국 종목을 언급한 메시지만 골라 센 일별 톤. 국내는 telegram_sentiment_daily 로 따로 있다 — 한 표에 섞으면 국장 화면의 테마 목록에 시장이 끼어든다(파일 머리 주석)';
comment on column public.telegram_us_sentiment_daily.date is
  '메시지 작성일(KST). ⚠️ 미국장은 KST 새벽에 끝나므로 "미국장 하루"와 하루 어긋난다';
comment on column public.telegram_us_sentiment_daily.scope is
  '''overall'' 또는 (앞으로 붙을) 미국 테마명. 국내 표의 scope 와 같은 뜻이되 값 공간이 완전히 분리돼 있다';
comment on column public.telegram_us_sentiment_daily.neutral_count is
  '시황·공시처럼 담담한 글. 화면의 낙관도는 이걸 빼고 환산한다 — 같이 세면 늘 비관으로 기운다';

create index if not exists tg_us_sentiment_daily_date_idx
  on public.telegram_us_sentiment_daily (date desc);

alter table public.telegram_us_sentiment_daily enable row level security;


-- ── 일별 화제어 ─────────────────────────────────────────────────────────────
-- 종목명이 아닌 말(로보택시·CAPEX·메모리약세 …). 종목은 telegram_message_us_stocks 가
-- 담당하므로 집계 단계에서 국내·미국 종목명을 둘 다 빼고 센다.
--
-- ⭐ **전체 코퍼스 카운트를 같은 행에 함께 둔다.** 카드가 빈도가 아니라 '쏠림'으로
--    줄 세우기 때문이다(아래 telegram_us_issue_keyword 주석). 쏠림의 분모를 국내
--    표(telegram_keyword_daily)에서 조인해 오지 않는 이유는 **대표 표기가 갈릴 수
--    있어서**다 — 양쪽 다 "정규화 버킷 안에서 최빈 표기"를 고르는데, 코퍼스가 다르면
--    드문 말에서 최빈값이 달라져 조인이 조용히 어긋난다. 한 스크립트가 같은 자리에서
--    둘 다 세면 그 위험이 0 이다.
create table if not exists public.telegram_us_keyword_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  keyword text not null,
  mention_count integer not null default 0,
  total_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (date, keyword)
);

comment on table public.telegram_us_keyword_daily is
  '미국 종목을 언급한 메시지에서 뽑힌 일별 화제어 수. 국내는 telegram_keyword_daily';
comment on column public.telegram_us_keyword_daily.keyword is
  '정규화 버킷의 대표 표기. 사전이 정한 표기가 있으면 그것, 없으면 실제 표기 중 최빈값';
comment on column public.telegram_us_keyword_daily.mention_count is
  '그날 **미국 종목을 언급한** 메시지에서 이 말이 나온 횟수';
comment on column public.telegram_us_keyword_daily.total_count is
  '그날 **전체** 메시지에서 이 말이 나온 횟수(미국분 포함). 쏠림의 분모다';

create index if not exists tg_us_keyword_daily_date_idx
  on public.telegram_us_keyword_daily (date desc);

alter table public.telegram_us_keyword_daily enable row level security;


-- ── 이슈 키워드 카드(선계산) ────────────────────────────────────────────────
-- migration_023 의 telegram_issue_keyword 와 같은 모양·같은 이유다. 카드는 10줄인데
-- 그 10줄을 고르려면 화제어 전체를 세어야 해서, 렌더 시점에 하면 14일치를 1,000행씩
-- 왕복해 읽게 된다(국내에서 /kadera 서버 렌더 1,775ms 중 1,131ms 가 이 카드였다).
--
-- ⚠️ 국내와 달리 **프론트 폴백을 만들지 않는다.** 국내는 이 표가 비면 즉석 계산으로
--    떨어지는데, 그 폴백이 상수 네 개를 파이썬·TS 로 두 벌 갖게 만들어 "표가 빌 때만
--    화면이 달라지는" 가장 알아채기 어려운 어긋남을 낳았다. 미장은 표가 비면 카드에
--    이유를 적는다 — 눈에 보이는 고장이 조용한 불일치보다 낫다.
--
-- ## ⭐ 빈도가 아니라 '쏠림'으로 줄 세운다 (실측으로 정한 규칙)
--
-- 빈도순으로 뽑아 보니 국장 카드와 **10줄 중 6줄이 겹쳤다**(실적호조·HBM·데이터센터·
-- AI·매출증가·AI인프라). 미국 언급 메시지도 같은 채널이 쓴 같은 코퍼스라, 흔한 말은
-- 양쪽에서 똑같이 흔하다. 그건 미장 카드가 아니라 국장 카드의 사본이다
-- (뜨는 채널·채널 파워 랭킹을 미장에 안 만든 것과 같은 이유).
--
-- 전체 대비 미국 쪽에 몰린 정도로 줄 세우니 국장 카드와 **하나도 겹치지 않았다**:
-- 로보택시 5.6배 · AI수익성 5.1배 · 메모리약세 4.9배 · 기술주강세 4.9배 · CAPEX 4.5배.
-- 함께 언급 카드가 빈도 대신 lift 를 쓴 것과 정확히 같은 판단이다.
--
-- ⚠️ **쏠림에는 최소 표본과 분산이 함께 붙어야 한다.** 복붙이 잦은 코퍼스라 한 기사가
--    20개 채널에 퍼지면 22회·92% 가 만들어진다. 실측으로 상위 14개는 전부 17~43채널·
--    3~8일에 퍼져 있었고 최다 채널 집중도가 4~15% 였다 — 지금은 깨끗하지만, 그건
--    오늘의 데이터가 그랬다는 것이지 규칙이 막아 준 것이 아니다. 그래서 문턱을 건다.
create table if not exists public.telegram_us_issue_keyword (
  rank smallint primary key,
  keyword text not null,
  mention_count integer not null,
  total_count integer not null default 0,
  skew numeric not null default 1,
  channel_count integer not null default 0,
  day_count integer not null default 0,
  trend text check (trend in ('up', 'down', 'flat')),
  computed_for date not null,
  updated_at timestamptz not null default now()
);

comment on table public.telegram_us_issue_keyword is
  '미장 카더라 이슈 키워드 카드에 그대로 그리는 상위 N개. calculate_us_telegram_sentiment.py 가 매 실행 전량 교체한다. 정렬 기준은 빈도가 아니라 쏠림이다(위 주석)';
comment on column public.telegram_us_issue_keyword.rank is
  '1부터. 화면 순서 그대로다 — 프론트가 다시 정렬하지 않는다';
comment on column public.telegram_us_issue_keyword.mention_count is
  '최근 7일, 미국 종목을 언급한 메시지에서의 언급 수';
comment on column public.telegram_us_issue_keyword.total_count is
  '같은 기간 전체 메시지에서의 언급 수. 화면이 "전체 N회 중 M회"를 말할 때 쓴다';
comment on column public.telegram_us_issue_keyword.skew is
  '(mention_count / total_count) ÷ (미국 메시지 비중). 1이면 전체와 같은 정도로 나온 말, 클수록 미국 얘기에서만 나오는 말';
comment on column public.telegram_us_issue_keyword.channel_count is
  '⭐ 이 말이 나온 서로 다른 채널 수. 복붙 한 건이 쏠림으로 둔갑하는 걸 막는 문턱이자, 화면이 표본을 보여 줄 재료';
comment on column public.telegram_us_issue_keyword.day_count is
  '이 말이 나온 서로 다른 날짜 수. channel_count 와 같은 이유';
comment on column public.telegram_us_issue_keyword.trend is
  '관심 점유율의 방향. 최근 3일 평균 점유율 vs 5~14일 전 평균. 비교할 과거가 없으면 null';
comment on column public.telegram_us_issue_keyword.computed_for is
  '어느 집계일 기준인지. 파이프라인이 밀렸을 때 이 표가 언제 것인지 로그 없이 알아보려는 표시용';

alter table public.telegram_us_issue_keyword enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — migration_023 과 같은 정책.
