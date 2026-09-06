-- Hatzze — 마이그레이션 069: 미장 '급등 종목' + '다가오는 일정'
--
-- 국내 짝은 마이그레이션 066(telegram_stock_move_reason · telegram_stock_event). 036·064 가
-- 세운 판단 그대로 표를 나눈다 — 국장은 6자리 종목코드가 `stocks` 를, 미장은 라틴 티커가
-- `us_stocks` 를 참조한다. 한 컬럼에 섞으면 "6자리 코드"를 가정한 곳이 전부 잠재 버그가 된다.
--
-- ## telegram_us_stock_move_reason — 시세 컬럼이 없다
--
-- 국내 표에는 `change_rate`·`close_price` 가 있다. 다음 날 KRX 가 그날 확정 시세를 주므로
-- 파이프라인이 뒤늦게 채워 두는 자리다(generate_move_reasons.fill_krx).
--
-- ⚠️ **미장에는 그 자리를 두지 않았다.** 집계 기준일이 메시지 작성일(KST)인데 미국장은 KST
--    새벽 5시에 닫혀 **하루가 어긋난다**(calculate_us_stock_daily.py 머리말). 어느 세션의
--    종가인지가 날짜만 봐서는 안 정해지므로, 화면이 야후 일봉에서 **작성일 하루 전까지의
--    마지막 세션**을 직접 집는다(lib/kadera-us-why.ts). 아무도 안 쓰는 컬럼을 두면 다음
--    사람이 "왜 안 채우지"를 묻게 된다.
--
-- `quoted_change_rate` 는 국내와 같다 — 채널 글에 적힌 등락 표기라 후보 고르기·줄 세우기
-- 에만 쓰고 화면에 등락률로 내지 않는다. `reason` 이 null 인 행도 저장한다("채널에서 까닭을
-- 말한 곳이 없다"도 정보다).
--
-- ## telegram_us_stock_event — 공짜로 얻는 표다
--
-- 일정 추출(extract_telegram_events.py)은 이미 메시지마다 market 을 KR·US·MACRO·OTHER 로
-- 받고 있었고, **US 를 받아서 버리고 있었다**(2026-09-06 백필 실측: KR 479 · US 490 · MACRO
-- 312 · OTHER 81). 버리던 것을 저장하는 것뿐이라 **LLM 비용이 한 푼도 안 는다.**
--
-- ⚠️ 그래서 옛 `telegram_event_scan` 행은 US 몫이 비어 있다. 그 창은 `--rescan` 으로 한 번
--    다시 훑어야 한다(읽음 표시를 무시하고 같은 메시지를 다시 묻는다).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_us_stock_move_reason (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  ticker text not null references public.us_stocks (ticker) on delete cascade,
  reason text,
  quoted_change_rate numeric,
  move_msgs integer not null default 0,
  mention_count integer not null default 0,
  channel_count integer not null default 0,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, ticker)
);
comment on table public.telegram_us_stock_move_reason is
  '미장 급등 종목 카드의 까닭 한 줄(LLM). 국내 짝은 telegram_stock_move_reason — 이쪽은 시세 컬럼이 없다(머리말 참고)';
comment on column public.telegram_us_stock_move_reason.date is
  '메시지 작성일(KST). ⚠️ 미국장 하루와 어긋난다 — 화면은 이 날짜 하루 전까지의 마지막 미국장 세션 종가를 쓴다';
comment on column public.telegram_us_stock_move_reason.reason is
  '채널이 말한 까닭, 12~45자 명사형. null = 그날 언급은 있었지만 까닭을 말한 글이 없다';
comment on column public.telegram_us_stock_move_reason.quoted_change_rate is
  '채널 글에서 종목명 옆에 적힌 등락률(상한가 규칙은 국내용이라 미장에선 사실상 안 걸린다). 후보 선정·정렬에만 쓴다';
create index if not exists tg_us_move_reason_date_idx
  on public.telegram_us_stock_move_reason (date desc);
create index if not exists tg_us_move_reason_ticker_date_idx
  on public.telegram_us_stock_move_reason (ticker, date desc);
alter table public.telegram_us_stock_move_reason enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 옆 표들과 같다.

create table if not exists public.telegram_us_stock_event (
  id uuid primary key default gen_random_uuid(),
  channel_handle text not null,
  message_id bigint not null,
  ticker text not null references public.us_stocks (ticker) on delete cascade,
  event_date date not null,
  date_precision text not null check (date_precision in ('day', 'month', 'quarter', 'year')),
  event text not null,
  posted_at timestamptz not null,
  model text,
  created_at timestamptz not null default now(),
  unique (channel_handle, message_id, ticker, event_date, event),
  foreign key (channel_handle, message_id)
    references public.telegram_messages (channel_handle, message_id) on delete cascade
);
comment on table public.telegram_us_stock_event is
  '채널 글에서 뽑은 미국 종목의 앞날 일정(LLM). 확인된 일정이 아니라 채널이 짚은 날이다. 국내 짝은 telegram_stock_event';
comment on column public.telegram_us_stock_event.date_precision is
  'day = 날짜가 적혀 있었다 · month = 달만 · quarter = 분기 · year = 해만. 달력에는 day 만 올린다';
create index if not exists tg_us_stock_event_date_idx
  on public.telegram_us_stock_event (event_date);
create index if not exists tg_us_stock_event_ticker_date_idx
  on public.telegram_us_stock_event (ticker, event_date);
alter table public.telegram_us_stock_event enable row level security;
