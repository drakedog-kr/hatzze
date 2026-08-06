-- Hatzze — 마이그레이션 029: 트렌딩 메시지를 미리 골라 둔다 (카더라 리포트)
--
-- 화면의 '트렌딩 메시지' 시트(오늘/최근 7일/최근 30일 탭)가 쓰는 목록이다.
--
-- 왜 비싼가: 창마다 telegram_messages 를 **조회수 순으로 정렬해 상위 200건**을 받은 뒤,
-- 점수(조회×0.5 + 공유×3 + 댓글×1.5)로 다시 줄 세워 36건만 쓴다. 조회수 순과 점수 순이
-- 달라서 후보를 넉넉히 받아야 하는 구조다. 그걸 세 창에 각각 한다.
--
-- 실측(2026-08-07 콜드 트레이스): 세 창 3왕복의 소요 합이 **11,011ms**, 웜에서는 596ms.
-- 표가 11.8만 행이고 그 전부가 30일 창 안이라(수집 시작이 22일 전) 30일 창은 사실상
-- 표 전체를 다룬다.
--
-- **캐싱이 아니라 계산을 옮기는 것이다**(마이그레이션 023·027·028 과 같은 성격).
-- telegram_messages 는 파이프라인이 돌 때만 바뀐다 — 조회수·공유수도 그때 갱신된다.
-- 실행과 실행 사이에 이 36줄은 얼어붙은 입력에 대한 상수인데 매 방문이 다시 뽑고 있었다.
--
-- ⭐ **'오늘' 창을 얼려도 목록이 안 바뀐다.** 프론트는 새벽 9시(FIRST_COLLECTION_HOUR_KST)
-- 전 방문자에게 '어제 0시부터'를 보여준다. 파이프라인은 11시·19시에 도니 저장값의
-- 시작점도 그 날 0시로 같고, 그 사이에 새 메시지도 안 들어온다(수집이 파이프라인 때만
-- 되므로). 즉 같은 창이다.
--
-- ⭐ **"11시간 전"은 저장하지 않는다.** posted_at(절대 시각)만 저장하고 화면이 렌더할 때
-- Date.now() 와 빼서 만든다. 그래서 저장 목록이 그대로여도 나이는 계속 흘러간다.
-- 문자열로 저장했다면 이 카드는 못 옮겼을 것이다.
--
-- 저장 안 하는 것 둘: 채널 제목·프로필 사진(channelMeta 가 telegram_channels 에서 읽는다,
-- 콜드 39~48ms 로 이미 싸다)과 주제 태그(본문에서 뽑는 순수 함수라 화면에서 만든다).
--
-- window_key 를 'window' 로 안 쓴 이유: WINDOW 는 Postgres 예약어라 쓸 때마다 따옴표가
-- 붙는다.
--
-- ※ 다른 telegram_* 와 동일하게 비공개(RLS 켜되 공개 read 정책 없음).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_trending_message (
  window_key text not null check (window_key in ('today', 'w7', 'w30')),
  rank smallint not null,
  channel_handle text not null references public.telegram_channels (handle) on delete cascade,
  message_id bigint not null,
  text text not null,
  views integer not null default 0,
  forwards integer not null default 0,
  replies integer not null default 0,
  posted_at timestamptz not null,
  stocks jsonb not null default '[]'::jsonb,
  window_start timestamptz not null,
  computed_for date not null,
  updated_at timestamptz not null default now(),
  primary key (window_key, rank)
);

comment on table public.telegram_trending_message is
  '트렌딩 메시지 카드의 창별 상위 목록. 렌더마다 200건을 받아 다시 줄 세우지 않도록 파이프라인이 미리 골라 둔다';
comment on column public.telegram_trending_message.window_key is
  '창. today | w7(7일) | w30(30일) — 화면 탭과 일대일';
comment on column public.telegram_trending_message.rank is
  '점수(조회×0.5 + 공유×3 + 댓글×1.5) 내림차순 1부터. 화면은 앞에서부터 6건씩 펼친다';
comment on column public.telegram_trending_message.posted_at is
  '메시지 작성 시각. 화면의 "11시간 전"은 이 값으로 렌더할 때 계산한다(문자열을 저장하지 않는다)';
comment on column public.telegram_trending_message.stocks is
  '이 메시지에서 뽑힌 종목명 배열(최대 3). 사전 기반 추출 결과를 이름으로 풀어 둔 것';

alter table public.telegram_trending_message enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 다른 telegram_* 와 동일.
