-- Hatzze — 마이그레이션 066: 카더라 '급등락 종목'(옛 이름 '왜 올랐나') + '다가오는 일정' (국장)
--
-- 둘 다 **채널이 한 말을 종목·날짜에 붙여 둔 것**이지, 우리가 확인한 사실이 아니다.
-- 화면도 그렇게 말한다("채널이 말한 까닭", "채널이 짚은 날").
--
-- ## telegram_stock_move_reason — 그날 크게 움직인 종목에 채널이 말한 까닭 한 줄
--
-- 만드는 곳: data-pipeline/scripts/generate_move_reasons.py (저녁 실행에서 그날치를 만든다).
--
-- 후보는 **채널 글 자체**에서 고른다 — 종목명 옆에 적힌 등락률(`+29.8%`·`상한가`)과 그날
-- 언급 폭. KRX 오픈API 는 그날 시세를 다음 날 낮에야 주므로(5회 실측: 18:00 실행이
-- 늘 전날 기준일) 여기서 시세로 고를 수 없다. 화면이 보여주는 등락률은
--   ① `stocks.price_date` 가 이 날짜와 같으면 KRX 값(다음 날부터),
--   ② 아니면 렌더 시점에 그날 종가를 따로 구한 값(급부상·주요 종목과 같은 경로)이다.
-- `quoted_change_rate` 는 **채널 글에서 읽은 숫자**라 장중 값일 수 있다. 후보 고르기와
-- 줄 세우기에만 쓰고 화면에 등락률로 내지 않는다.
--
-- `reason` 이 null 인 행도 저장한다 — "채널에서 까닭을 말한 곳이 없다"도 정보라서다.
-- 급부상 카드가 문장 없는 자리에 까닭을 적는 것과 같은 규칙.
--
-- ## telegram_stock_event — 채널 글에서 뽑은 앞날의 일정
--
-- 만드는 곳: data-pipeline/scripts/extract_telegram_events.py.
-- 한 메시지에서 여러 일정이 나올 수 있고, 같은 일정을 여러 채널이 적는다. 화면이
-- (종목, 날짜)로 묶어 "몇 곳이 말했나"를 센다.
--
-- ⚠️ `date_precision` 이 요점이다. 모델이 "연말"·"내년"을 12-31·01-01 로 굳혀 쓴다
--    (2026-09-06 표본 150건 실측). 달력에는 **'day' 만** 올리고, 나머지는 종목 화면에
--    "10월 중"·"2027년" 처럼 글로 둔다.
--
-- ## telegram_event_scan — 어느 메시지를 이미 읽었나
--
-- 일정이 없는 메시지도 여기 남겨 다음 실행이 다시 안 부르게 한다(message_analysis 의
-- 증분 규칙과 같다). `id` 는 키셋 페이징용 — (channel_handle, message_id) 가 유일키다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_stock_move_reason (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  stock_code text not null references public.stocks (code) on delete cascade,
  reason text,
  quoted_change_rate numeric,
  move_msgs integer not null default 0,
  mention_count integer not null default 0,
  channel_count integer not null default 0,
  change_rate numeric,
  close_price integer,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, stock_code)
);
comment on table public.telegram_stock_move_reason is
  '그날 크게 움직인 종목에 채널이 말한 까닭 한 줄(LLM). 후보는 채널 글의 등락 표기와 언급 폭으로 고른다 — KRX 는 그날 시세를 다음 날 낮에 준다';
comment on column public.telegram_stock_move_reason.reason is
  '채널이 말한 까닭, 12~45자 명사형. null = 그날 언급은 있었지만 까닭을 말한 글이 없다(그것도 화면에 그대로 적는다)';
comment on column public.telegram_stock_move_reason.quoted_change_rate is
  '채널 글에서 종목명 옆에 적힌 등락률(상한가=+30). 장중 값일 수 있어 후보 선정·정렬에만 쓴다';
comment on column public.telegram_stock_move_reason.move_msgs is
  '등락 표기가 붙은 메시지 수. 후보의 근거 두께';
comment on column public.telegram_stock_move_reason.change_rate is
  'KRX 확정 등락률. 다음 날 stocks.price_date 가 이 날짜가 되면 스크립트가 채운다. 그전엔 null';
create index if not exists tg_stock_move_reason_date_idx
  on public.telegram_stock_move_reason (date desc);
create index if not exists tg_stock_move_reason_code_date_idx
  on public.telegram_stock_move_reason (stock_code, date desc);
alter table public.telegram_stock_move_reason enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 옆 표들과 같다.

create table if not exists public.telegram_stock_event (
  id uuid primary key default gen_random_uuid(),
  channel_handle text not null,
  message_id bigint not null,
  stock_code text not null references public.stocks (code) on delete cascade,
  event_date date not null,
  date_precision text not null check (date_precision in ('day', 'month', 'quarter', 'year')),
  event text not null,
  posted_at timestamptz not null,
  model text,
  created_at timestamptz not null default now(),
  unique (channel_handle, message_id, stock_code, event_date, event),
  foreign key (channel_handle, message_id)
    references public.telegram_messages (channel_handle, message_id) on delete cascade
);
comment on table public.telegram_stock_event is
  '채널 글에서 뽑은 앞날의 일정(LLM). 확인된 일정이 아니라 채널이 짚은 날이다 — 같은 일정을 채널마다 다른 날짜로 적기도 한다';
comment on column public.telegram_stock_event.date_precision is
  'day = 날짜가 적혀 있었다 · month = 달만("10월 중") · quarter = 분기 · year = 해만. 달력에는 day 만 올린다';
comment on column public.telegram_stock_event.event is
  '무슨 일인지 짧은 명사구(예: 3상 임상 결과 발표, 보호예수 해제). 전망·권유 없음';
comment on column public.telegram_stock_event.posted_at is
  '메시지 작성 시각 사본. "언제부터 이 이야기가 돌았나"를 세는 데 쓴다';
create index if not exists tg_stock_event_date_idx
  on public.telegram_stock_event (event_date);
create index if not exists tg_stock_event_code_date_idx
  on public.telegram_stock_event (stock_code, event_date);
alter table public.telegram_stock_event enable row level security;

create table if not exists public.telegram_event_scan (
  id uuid primary key default gen_random_uuid(),
  channel_handle text not null,
  message_id bigint not null,
  event_count integer not null default 0,
  scanned_at timestamptz not null default now(),
  unique (channel_handle, message_id),
  foreign key (channel_handle, message_id)
    references public.telegram_messages (channel_handle, message_id) on delete cascade
);
comment on table public.telegram_event_scan is
  '일정 추출을 이미 거친 메시지. 일정이 0건이어도 남겨 다음 실행이 같은 글을 다시 부르지 않게 한다';
alter table public.telegram_event_scan enable row level security;
