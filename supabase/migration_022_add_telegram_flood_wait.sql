-- Hatzze — 마이그레이션 022: 텔레그램 FloodWait 만료 시각 기록 (카더라 리포트)
--
-- 왜 필요한가: FloodWait 은 프로세스가 아니라 **계정**에 걸린다. 그런데 실행마다
-- 프로세스가 새로 뜨는 GitHub Actions 에서는 그 사실이 다음 실행으로 안 넘어가서,
-- 매 실행이 "일단 한 번 두드려 보고 FloodWait 을 받는" 것을 반복한다.
--
-- 실측(2026-07-28 01:28 UTC, run 30320356222):
--   peer 캐시 보유 0/317개 — 나머지만 유저네임을 풉니다(한 실행 최대 100개)
--   [중단] FloodWait(2464초) — 이번 실행의 남은 유저네임 조회 99건을 포기합니다
--   유저네임 조회(ResolveUsername) 1/100건 시도 · 캐시로 연 채널 0개
-- 그 실행은 캐시를 한 개도 못 채웠고, 이어지는 fetch_telegram.py 는 캐시 없는 채널을
-- 전부 건너뛰므로 그날 메시지 수집이 통째로 0건이 됐다.
--
-- 만료 시각을 남겨 두면 다음 실행이 그 전에는 resolve 를 아예 시도하지 않는다.
-- 시도 한 번을 아끼는 것 자체보다, **막힌 문을 계속 미는 것이 제한을 늘린다**는 쪽이
-- 중요하다(마이그레이션 021 참고 — 그게 14시간짜리 대기를 만든 경위다).
--
-- 한 행짜리 표다(id = 1 체크). 계정이 하나뿐이라 상태도 하나이고, upsert 한 번으로
-- 갱신된다. 이력이 필요하면 워크플로 로그에 남아 있다.
--
-- 기록하는 곳은 sync_telegram_channels.py 하나뿐이다 — 유저네임을 푸는 유일한
-- 스크립트라서다. fetch_telegram.py 가 메시지를 읽다 받는 FloodWait 은 메서드가 달라
-- (iter_messages ≠ ResolveUsername) 여기에 적지 않는다. 적으면 관계없는 제한 때문에
-- 캐시 채우기가 멈춘다.
--
-- ※ 다른 telegram_* 와 동일하게 비공개(RLS 켜되 공개 read 정책 없음).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_flood_wait (
  id smallint primary key default 1,
  wait_until timestamptz not null,
  seconds integer not null,
  recorded_at timestamptz not null default now(),
  constraint telegram_flood_wait_single_row check (id = 1)
);

comment on table public.telegram_flood_wait is
  '텔레그램이 우리 계정에 건 FloodWait 의 만료 시각. sync_telegram_channels.py 가 쓰고 읽는다. 이 시각 전에는 ResolveUsername 을 아예 시도하지 않는다';
comment on column public.telegram_flood_wait.wait_until is
  '이 시각(UTC)까지는 resolve 를 쉰다. FloodWaitError.seconds + 여유(60초)를 더해 적는다 — 만료 직후 바로 두드리면 몇 초 차이로 또 걸린다';
comment on column public.telegram_flood_wait.seconds is
  '텔레그램이 알려준 원래 대기 초. 반복되면 이 값이 커지므로 MAX_RESOLVES_PER_RUN 을 다시 볼 신호';

alter table public.telegram_flood_wait enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근.
