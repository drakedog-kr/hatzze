-- Hatzze — 마이그레이션 027: 수집량 집계를 미리 세어 둔다 (카더라 리포트)
--
-- 왜 필요한가: /kadera 히어로의 "총 메시지 7일 42,279개" 한 줄 때문에 렌더마다
--   select count(*) from telegram_messages where posted_at >= now() - 7일
-- 이 나간다. 창 안이 4.9만 행이라 표를 훑는다.
--
-- 실측(2026-08-07 콜드 트레이스): 이 한 줄이 **6,946ms**, 같은 질의가 웜에서는 236ms.
-- 버퍼가 식어 있으면 20~30배로 벌어진다.
--
-- **캐싱이 아니라 계산을 옮기는 것이다**(마이그레이션 023 과 같은 성격). telegram_messages
-- 는 파이프라인이 돌 때만 바뀌므로, 실행과 실행 사이에 이 수는 얼어붙은 입력에 대한
-- 상수다. 매 방문이 같은 답을 다시 세고 있었다.
--
-- ⭐ 덤으로 **옆줄과 기준 시각이 처음으로 맞는다.** 바로 옆 "활성 채널 7일"은
-- telegram_channel_stats.weekly_posts 를 읽는데 그건 파이프라인이 실행 시각 기준으로
-- 세어 둔 값이다. 반면 이 줄만 요청 시각 기준이라, 실행과 실행 사이에 창이 미끄러지며
-- 두 숫자가 서로 다른 시점을 말하고 있었다. 같은 스크립트가 같은 week_ago 로 함께
-- 세면 그 어긋남이 사라진다.
--
-- 쓰는 곳은 calculate_channel_influence.py 하나다. 그 스크립트가 이미 채널마다
-- **똑같은 창**으로 count 를 돌리고 있어서(weekly_posts), 전체 수 하나를 더 세는 것이
-- 자연스럽다. 채널별 합이 아니라 따로 세는 이유는 뜻이 다르기 때문이다 — 화면의 이
-- 줄은 **수집이 끊긴 채널이 남긴 옛 글도 일부러 포함한다**(lib/telegram-data.ts 의
-- 주석 참고). 채널별 합으로 갈음하면 그만큼 조용히 적게 나온다.
--
-- 날짜를 키에 두지 않고 **한 벌만** 둔다(023 과 같은 판단). 카드가 늘 '지금'만
-- 보여주고, 과거 시점을 되살릴 일이 없다. 원자료가 그대로 있어 언제든 다시 만든다.
-- computed_for·window_start 는 어느 실행의 어느 창인지 적어 두는 표시용이다.
--
-- 표가 없거나 비어 있어도 화면은 안 깨진다 — 프론트가 옛날처럼 직접 세는 길로
-- 되돌아간다(그리고 그 사실을 로그에 남긴다). 그래서 이 DDL 과 코드 배포는 순서가
-- 상관없다.
--
-- ※ 다른 telegram_* 와 동일하게 비공개(RLS 켜되 공개 read 정책 없음).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_collection_stats (
  id smallint primary key default 1 check (id = 1),
  messages_7d integer not null,
  window_start timestamptz not null,
  computed_for date not null,
  updated_at timestamptz not null default now()
);

comment on table public.telegram_collection_stats is
  '수집량 집계 한 벌. 렌더마다 세지 않도록 파이프라인이 미리 계산해 둔다(실행마다 덮어씀)';
comment on column public.telegram_collection_stats.messages_7d is
  'window_start 이후 telegram_messages 행 수. 채널로 안 좁힌다(끊긴 채널의 옛 글 포함)';
comment on column public.telegram_collection_stats.window_start is
  '센 창의 시작 시각(= 실행 시각 − 7일). 화면이 이 값을 근거로 창을 설명할 수 있게 남긴다';

alter table public.telegram_collection_stats enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 다른 telegram_* 와 동일.
