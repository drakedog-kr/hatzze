-- Hatzze — 마이그레이션 021: telegram_channels 에 텔레그램 peer 캐시 추가 (카더라 리포트)
-- 유저네임(handle)으로 채널을 열려면 ResolveUsername 을 부르는데, 이게 텔레그램에서
-- 가장 빡빡하게 조이는 호출이다. 채널이 12개일 땐 안 보였지만 317개가 되자 sync 와
-- fetch 가 매 실행 317번씩 풀었고(=실행당 634건), 2026-07-26 에 수동 실행까지 겹치자
-- 계정에 FloodWait 이 걸렸다. 07-27 저녁엔 317개 전부 실패해 그날 수집이 통째로 0건이
-- 됐다(대기 약 14시간). 밴이 아니라 메서드 단위 속도 제한이다.
--
-- (channel_id, access_hash) 를 한 번만 받아 두면 그 뒤로는 InputPeerChannel 로 바로
-- 열 수 있어 ResolveUsername 이 아예 사라진다. access_hash 는 계정마다 다른 값이라
-- 우리 세션 전용이며, 채널이 재생성되면 무효가 된다 — 그때는 sync 가 유저네임으로
-- 다시 풀어 값을 갱신한다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.telegram_channels
  add column if not exists channel_id bigint,
  add column if not exists access_hash bigint;

comment on column public.telegram_channels.channel_id is '텔레그램 채널 고유 ID. sync_telegram_channels.py 가 채운다. access_hash 와 짝으로 InputPeerChannel 을 만들어 ResolveUsername 없이 채널을 연다';
comment on column public.telegram_channels.access_hash is '위 channel_id 의 접근 해시(우리 계정 전용 값). 비어 있으면 sync 가 유저네임으로 한 번 풀어서 채운다';
