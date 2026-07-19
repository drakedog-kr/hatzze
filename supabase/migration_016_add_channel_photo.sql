-- Hatzze — 마이그레이션 016: telegram_channels 에 프로필 사진 추가 (카더라 리포트)
-- 채널 랭킹/뜨는 채널 목록에 채널 프로필 사진을 보여주기 위한 컬럼.
--
-- 별도 스토리지 버킷 없이 작은 썸네일(Telethon download_big=False, 보통 160px)을
-- data URI(base64)로 그대로 담는다 — 채널이 수십 개 규모라 용량이 작고, 프론트가
-- 서버에서 조인해 내려주므로 추가 요청도 없다. 채널 수가 크게 늘면 Supabase
-- Storage로 옮기는 게 낫다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.telegram_channels
  add column if not exists photo text;

comment on column public.telegram_channels.photo is '채널 프로필 사진 data URI(base64 JPEG). sync_telegram_channels.py가 채운다. 없으면 프론트가 이니셜 아바타로 폴백';
