-- Hatzze — 마이그레이션 026: telegram_messages 트렌딩 정렬용 인덱스
--
-- 카더라의 트렌딩 메시지는 창(오늘/7일/30일)마다
--   where posted_at >= :since and text is not null
--   order by views desc nulls last
--   limit 200
-- 을 던진다(`getTrendingMessages`, lib/telegram-data.ts).
--
-- 009 가 깔아 둔 인덱스는 (posted_at desc) 와 (channel_handle, posted_at desc) 둘뿐이라
-- **views 로 정렬할 길이 없다.** 그래서 창이 넓을수록 표 전체를 훑어 정렬한다.
-- 2026-08-06 실측: 표 118,657행이 **전부 30일 창 안**이라(수집 시작이 22일 전) 30일
-- 트렌딩은 사실상 풀스캔이다. 버퍼가 식어 있으면 이 한 줄이 2초, count(*) 는 4.7초였다.
-- /kadera 가 조용한 뒤 첫 요청에서 9.3초, 이어지는 요청에서 0.9초인 것이 이 차이다.
--
-- 부분 인덱스로 두는 이유: 쿼리가 늘 `text is not null` 을 함께 걸고, 본문 없는
-- 미디어 전용 메시지는 트렌딩 후보가 아니다. 인덱스가 그만큼 작아진다.
--
-- '오늘' 창은 이 인덱스가 아니라 기존 posted_at 인덱스가 더 싸므로(후보가 몇천 행뿐)
-- 플래너가 알아서 고르게 둔다 — 그래서 (posted_at, views) 복합으로 만들지 않았다.
-- 복합으로 만들면 posted_at 범위 뒤의 views 는 정렬에 쓸 수 없어 정렬이 그대로 남는다.
--
-- Supabase SQL Editor에서 실행하세요.

create index if not exists telegram_messages_views_idx
  on public.telegram_messages (views desc nulls last)
  where text is not null;

comment on index public.telegram_messages_views_idx is
  '트렌딩 메시지의 order by views desc 용. text 있는 행만(트렌딩 후보 조건과 동일)';
