-- Hatzze — 마이그레이션 023: 이슈 키워드 카드의 계산 결과 저장 (카더라 리포트)
--
-- 왜 필요한가: /kadera 의 '이슈 키워드' 카드는 10줄인데, 그 10줄을 **고르려면**
-- telegram_keyword_daily 14일치를 통째로 읽어야 한다. 상위 10개가 무엇인지는 모든
-- 화제어의 합을 내기 전엔 알 수 없고, ▲▼ 는 "그날 전체 화제어 언급" 을 분모로 쓰는
-- 점유율 비교라 화면에 안 뜨는 말 하나까지 필요하기 때문이다.
--
-- 실측(2026-07-29, 활성 200채널):
--   14일 창 23,672행 → PostgREST 1,000행 캡에 걸려 순차 왕복 24회
--   /kadera 서버 렌더 1,775ms → 이 조회만 빼면 644ms (절제 실험, 중앙값)
-- 카드 하나가 페이지 서버 시간의 약 3분의 2였다. 행 수는 채널 수에 비례해서, 캐시가
-- 317개로 다 차면 하루 ~2,400행 → 왕복 34회로 저절로 더 나빠진다.
--
-- **캐싱이 아니라 계산을 옮기는 것이다.** telegram_messages·telegram_keyword_daily 는
-- 파이프라인이 돌 때만 바뀌므로, 실행과 실행 사이에 이 계산은 얼어붙은 입력에 대한
-- 순수 함수다 — 매 렌더가 23,672행을 다시 읽어 매번 같은 10줄을 만들고 있었다.
-- 그래서 미리 계산해 두어도 화면 값은 한 글자도 안 달라진다(revalidate 류의
-- '얼마나 낡아도 되나' 거래와 다르다).
--
-- 쓰는 곳은 calculate_telegram_sentiment.py 하나다. 그 스크립트가 이미 (날짜, 화제어,
-- 언급수)를 전부 메모리에 들고 있어서(telegram_keyword_daily 를 만드는 당사자다)
-- DB 추가 조회 없이 계산된다.
--
-- 날짜를 키에 두지 않고 **한 벌만** 둔다. 카드가 늘 '지금'만 보여주고, 과거 시점의
-- 카드를 되살릴 일이 없다. 원자료(telegram_keyword_daily)가 그대로 남아 있어 언제든
-- 다시 만들 수 있다. computed_for 는 어느 집계일 기준인지 적어 두는 표시용이다.
--
-- ※ 다른 telegram_* 와 동일하게 비공개(RLS 켜되 공개 read 정책 없음).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_issue_keyword (
  rank smallint primary key,
  keyword text not null,
  mention_count integer not null,
  trend text check (trend in ('up', 'down', 'flat')),
  computed_for date not null,
  updated_at timestamptz not null default now()
);

comment on table public.telegram_issue_keyword is
  '/kadera 이슈 키워드 카드에 그대로 그리는 상위 N개. calculate_telegram_sentiment.py 가 매 실행 전량 교체한다. 표가 비어 있으면 프론트가 telegram_keyword_daily 에서 즉석 계산으로 떨어지므로, 이 표는 속도만 담당하고 정확성은 담당하지 않는다';
comment on column public.telegram_issue_keyword.rank is
  '1부터. 화면 순서 그대로다 — 프론트가 다시 정렬하지 않는다';
comment on column public.telegram_issue_keyword.mention_count is
  '최근 7일 언급 수(화면에 그대로 표시)';
comment on column public.telegram_issue_keyword.trend is
  '관심 점유율의 방향. 최근 3일 평균 점유율 vs 5~14일 전 평균. 비교할 과거가 없으면 null(화면에서 화살표를 안 그린다)';
comment on column public.telegram_issue_keyword.computed_for is
  '어느 집계일 기준인지. 파이프라인이 밀렸을 때 이 표가 언제 것인지 로그 없이 알아보려는 표시용';

alter table public.telegram_issue_keyword enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근.
