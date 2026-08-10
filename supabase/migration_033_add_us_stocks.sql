-- Hatzze — 마이그레이션 033: 미국 종목 마스터 + 메시지×미국종목 (미장 카더라)
--
-- 국내 쪽 짝: migration_012(stocks) + migration_013(telegram_message_stocks).
--
-- ※ 번호가 030→033 인 이유: 030~032 는 서학개미 해부도(feat/seohak-us-holdings)가
--   먼저 쓰고 있다. 그 브랜치는 아직 푸시 전이라 origin 을 봐도 안 보인다 —
--   번호를 고를 땐 `git worktree list` 로 다른 세션의 워크트리까지 볼 것.
--
-- ## 왜 stocks 표에 섞지 않고 따로 두나
--
-- `extract_telegram_stocks.py` 가 `stocks` 표를 **통째로 읽어** 국내 종목 사전을 만든다
-- (load_dictionary). 미국 티커를 거기 넣는 순간 국내 추출이 티커 179개를 전부 매칭하기
-- 시작한다. 그게 얼마나 위험한지는 이미 실측됐다 — 지금도 씨게이트($STX)가 국내
-- STX(011810)로, 골드만삭스(GS)가 국내 GS(078930)로 잘못 태그되고 있다.
-- 사전을 합치면 그 충돌이 전면화된다. 표를 나누면 그 위험이 0 이다.
--
-- 코드 체계도 다르다. stocks.code 는 6자리 숫자이고 티커는 1~5자 라틴이라,
-- 한 컬럼에 섞으면 "6자리 코드"를 가정한 곳이 전부 잠재 버그가 된다.
--
-- Supabase SQL Editor에서 실행하세요.

-- ── 미국 종목 마스터 ────────────────────────────────────────────────────────
-- 국내는 KRX API 가 종목명을 공짜로 주지만 미국은 **한글 표기를 주는 원천이 없다**.
-- 그래서 이 표의 source of truth 는 API 가 아니라 `config/us_stock_extraction.py` 이고,
-- sync 스크립트가 그 사전을 여기로 밀어 넣는다(프론트가 파이썬 사전을 못 읽어서다.
-- 파이썬·TS 로 같은 목록을 두 벌 두면 반드시 어긋난다).
create table if not exists public.us_stocks (
  ticker text primary key,
  name_ko text not null,
  name_en text,
  exchange text,
  synced_at timestamptz not null default now()
);

comment on table public.us_stocks is '미국 종목 마스터(티커↔한글 표기). config/us_stock_extraction.py 가 원본이고 sync 스크립트가 밀어 넣는다';
comment on column public.us_stocks.ticker is '거래소 티커. 대문자 1~5자';
comment on column public.us_stocks.name_ko is '화면에 쓸 대표 한글 표기. 사전에서 그 티커에 처음 나온 표기';
comment on column public.us_stocks.name_en is 'SEC company_tickers 의 정식 영문명. 검증·툴팁용이고 매칭엔 안 쓴다';
comment on column public.us_stocks.exchange is 'Nasdaq/NYSE 등. SEC company_tickers_exchange 기준';

-- 종목명은 비밀이 아니고 프론트가 티커→한글명을 바로 읽는다(국내 stocks 와 같은 정책).
alter table public.us_stocks enable row level security;
drop policy if exists "us_stocks public read" on public.us_stocks;
create policy "us_stocks public read" on public.us_stocks for select using (true);

-- ── 메시지 × 미국 종목 ──────────────────────────────────────────────────────
-- telegram_message_stocks 와 같은 모양. 재실행 = 전량 삭제 후 재삽입이라
-- 사전을 고치면 과거분까지 소급 반영된다.
create table if not exists public.telegram_message_us_stocks (
  id uuid primary key default gen_random_uuid(),
  channel_handle text not null,
  message_id bigint not null,
  ticker text not null references public.us_stocks (ticker),
  match_text text,
  method text,
  created_at timestamptz not null default now(),
  unique (channel_handle, message_id, ticker),
  foreign key (channel_handle, message_id)
    references public.telegram_messages (channel_handle, message_id) on delete cascade
);

comment on table public.telegram_message_us_stocks is '메시지 본문에서 찾은 미국 종목 언급. 국내는 telegram_message_stocks 로 따로 쌓인다';
comment on column public.telegram_message_us_stocks.match_text is '본문에 실제로 적혀 있던 표기. 오탐을 되짚을 때 이게 없으면 못 찾는다';
comment on column public.telegram_message_us_stocks.method is 'dict(사전 표기) 등 어느 경로로 잡혔나';

create index if not exists telegram_message_us_stocks_ticker_idx
  on public.telegram_message_us_stocks (ticker);
-- 집계는 날짜로 자르는데 날짜는 telegram_messages 에 있다. 조인 키로 먼저 좁힌다.
create index if not exists telegram_message_us_stocks_msg_idx
  on public.telegram_message_us_stocks (channel_handle, message_id);

-- 원본 메시지와 같은 정책: 공개 read 없음. 프론트는 service_role 로 읽는다.
alter table public.telegram_message_us_stocks enable row level security;


-- ── 일별 종목 집계 ──────────────────────────────────────────────────────────
-- 국내 짝: migration_014(telegram_stock_daily). 컬럼과 가중치를 그대로 맞춘다 —
-- 두 화면이 같은 뜻의 숫자를 다르게 계산하면 나중에 비교 카드를 못 만든다.
create table if not exists public.telegram_us_stock_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  ticker text not null references public.us_stocks (ticker),
  mention_count integer not null default 0,
  channel_count integer not null default 0,
  sum_views bigint not null default 0,
  sum_forwards integer not null default 0,
  weighted_score numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (date, ticker)
);

comment on table public.telegram_us_stock_daily is '일별·미국종목별 언급 집계. 급부상 종목·종목 리포트·테마 로테이션의 토대. 국내는 telegram_stock_daily';
comment on column public.telegram_us_stock_daily.date is '메시지 작성일(KST) 기준. ⚠️ 미국장은 KST 새벽에 끝나므로 "미국장 하루"와 이 날짜는 하루 어긋난다 — 화면에서 "그날 장"이라고 쓰지 말 것';
comment on column public.telegram_us_stock_daily.weighted_score is '언급 메시지들의 트렌딩 점수 합(views×0.5 + forwards×3.0 + replies×1.5). 국내와 같은 가중치';

create index if not exists tg_us_stock_daily_ticker_date_idx
  on public.telegram_us_stock_daily (ticker, date desc);
create index if not exists tg_us_stock_daily_date_idx
  on public.telegram_us_stock_daily (date desc);

alter table public.telegram_us_stock_daily enable row level security;


-- ── 일별 채널 집계 (국장/미장 비중) ─────────────────────────────────────────
-- 카드 둘이 이 한 표를 본다:
--   · "채널의 미장 비중"        채널별로 us_msgs / total_msgs
--   · "국장 vs 미장 관심 배분"   날짜별로 채널을 합산
--
-- 조회로 대신할 수 없어 표를 둔다 — 채널×날짜 비중을 읽기 시점에 세려면 메시지
-- 전량을 훑어야 하고, 그건 statement timeout 에 걸린다(미장 사전을 만들 때 ILIKE
-- 집계가 8초에 전부 막혔다). 하루 317행이라 표는 작다.
create table if not exists public.telegram_us_channel_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  channel_handle text not null references public.telegram_channels (handle) on delete cascade,
  total_msgs integer not null default 0,
  us_msgs integer not null default 0,
  kr_msgs integer not null default 0,
  created_at timestamptz not null default now(),
  unique (date, channel_handle)
);

comment on table public.telegram_us_channel_daily is '일별·채널별 메시지 수와 그중 미국/국내 종목을 언급한 수. 채널의 미장 비중과 국장·미장 관심 배분이 이 표를 본다';
comment on column public.telegram_us_channel_daily.total_msgs is '그날 그 채널의 메시지 수. 본문이 없는 것(미디어만)도 포함한다 — 비중의 분모라 실제 발행량이어야 한다';
comment on column public.telegram_us_channel_daily.us_msgs is '그중 미국 종목을 하나라도 언급한 메시지 수';
comment on column public.telegram_us_channel_daily.kr_msgs is '그중 국내 종목을 하나라도 언급한 메시지 수. us_msgs 와 겹칠 수 있다(한 메시지가 양쪽을 다 말한다)';

create index if not exists tg_us_channel_daily_date_idx
  on public.telegram_us_channel_daily (date desc);
create index if not exists tg_us_channel_daily_channel_idx
  on public.telegram_us_channel_daily (channel_handle, date desc);

alter table public.telegram_us_channel_daily enable row level security;


-- ── 미국×국내 동시 언급 (미장 카더라의 핵심 카드) ───────────────────────────
--
-- "엔비디아 얘기가 나오면 어느 국내 종목이 같이 불리나". 미국 언급 메시지의 36.4%가
-- 국내 종목을 같이 말한다(실측 6,266건 / 30일).
--
-- ## 왜 일별이 아니라 스냅샷인가
--
-- lift 는 창 전체의 주변 빈도가 있어야 계산된다. 일별로 쪼개 저장하면 프론트가
-- 읽기 시점에 창을 다시 잡아 lift 를 재계산해야 하는데, 그러면 **창의 끝점이
-- 파이프라인과 어긋나는 순간 숫자가 갈린다**(같은 함정을 이미 겪었다).
-- 그래서 파이프라인이 창을 정해 계산하고, 그 창을 행에 적어 둔다.
--
-- ## 왜 빈도가 아니라 lift 인가
--
-- 빈도로 줄 세우면 유명한 것끼리 붙어 시시하다(엔비디아×SK하이닉스). lift 로 보면
-- 진짜 연결이 나온다 — 일라이릴리×펩트론 74.8배, 머크×알테오젠 37.9배.
-- ⚠️ **최소 표본 없이 lift 를 쓰면 안 된다.** 국내 급부상 카드가 `2회 언급 ▲162.8배`로
--    과장돼 보였던 것과 같은 함정이다. 계산 스크립트가 문턱을 걸고 그 값을 여기 적는다.
create table if not exists public.telegram_us_comention (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null,
  window_days integer not null,
  ticker text not null references public.us_stocks (ticker),
  stock_code text not null references public.stocks (code),
  pair_count integer not null,
  channel_count integer not null default 0,
  day_count integer not null default 0,
  us_count integer not null,
  kr_count integer not null,
  sample_size integer not null,
  lift numeric not null,
  created_at timestamptz not null default now(),
  unique (as_of_date, window_days, ticker, stock_code)
);

comment on table public.telegram_us_comention is '창 안에서 함께 언급된 (미국종목, 국내종목) 쌍. 매 실행 그 창을 다시 계산해 갈아 끼운다';
comment on column public.telegram_us_comention.as_of_date is '창의 **끝점**. 프론트는 이 값으로 창을 고정해 읽는다 — 읽기 시점에 창을 다시 잡으면 파이프라인과 숫자가 갈린다';
comment on column public.telegram_us_comention.pair_count is '두 종목이 같은 메시지에 함께 나온 메시지 수';
comment on column public.telegram_us_comention.channel_count is '⭐ 그 쌍이 나온 서로 다른 채널 수. **횟수보다 이게 중요하다** — 같은 기사가 여러 채널에 복붙되는 코퍼스라, 5회가 한 채널이면 연결이 아니라 복사본 하나다(별칭 후보를 고를 때 이미 겪었다: 4자리 중 3이 같은 날 같은 기사였다)';
comment on column public.telegram_us_comention.day_count is '그 쌍이 나온 서로 다른 날짜 수. channel_count 와 같은 이유 — 하루짜리 이벤트와 지속되는 연결을 가른다';
comment on column public.telegram_us_comention.us_count is 'lift 분모에 쓴 주변 빈도 — 창 안에서 이 미국 종목이 나온 메시지 수. 저장해 두면 lift 를 되짚을 수 있다';
comment on column public.telegram_us_comention.kr_count is '같은 이유로 저장하는 국내 종목의 주변 빈도';
comment on column public.telegram_us_comention.sample_size is 'lift 계산에 쓴 모집단 크기(창 안에서 양쪽을 다 언급한 메시지 수). ⚠️ 종목을 잔뜩 나열한 시황 글은 빼고 센다 — 나열은 연결이 아니다';
comment on column public.telegram_us_comention.lift is 'pair_count / (us_count × kr_count / sample_size). 1이면 우연, 클수록 특별한 연결';

create index if not exists tg_us_comention_asof_idx
  on public.telegram_us_comention (as_of_date desc, lift desc);
create index if not exists tg_us_comention_ticker_idx
  on public.telegram_us_comention (ticker, as_of_date desc);

alter table public.telegram_us_comention enable row level security;
