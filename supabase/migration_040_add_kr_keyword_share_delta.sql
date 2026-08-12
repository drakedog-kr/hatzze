-- Hatzze — 마이그레이션 040: 국장 이슈 키워드의 점유율 변동폭(%p)
--
-- 미장 짝은 migration_038(telegram_us_issue_keyword.share_delta) 이고, 이유도 같다.
--
-- 2026-08-12 에 국장 이슈 키워드 카드를 미장과 같은 조판으로 통일했다. 그 조판은 줄마다
-- **얼마나 움직였나**(%p)를 적고, 카드 위 하이라이트 한 칸이 '가장 큰 변동'을 세운다.
-- `trend` 열은 up/flat/down 셋뿐이라 방향만 말하므로 "가장 큰"을 고를 수가 없다.
--
-- 화면에서 계산하지 않는 이유도 같다: '최근 3일 vs 5일 이상 이전'이라는 창 규칙이
-- 파이썬과 TS 에 두 벌 생긴다. 파이프라인은 이 값을 낼 때 이미 recent_avg·prior_avg 를
-- 손에 들고 있으므로 빼기 한 번을 저장하는 편이 싸다. trend 는 같은 값에 flat 문턱만
-- 더한 것이 된다.
--
-- ## 이 열이 없어도 화면은 안 깨진다
--
-- lib/telegram-data.ts 의 loadIssueKeywords 가 이 열을 넣어 한 번, 빼고 한 번 조회한다.
-- 없으면 %p 를 그냥 안 그린다 — **즉석 계산 경로로 떨어지지 않는 것이 중요하다**(그 경로는
-- 14일치 원자료를 다시 세느라 렌더가 1초 넘게 길어진다).
--
-- 단위: 하루 몫(그 화제어 언급 수 / 그날 전체 화제어 언급 합)의 창 평균 차이. ×100 이 %p.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.telegram_issue_keyword
  add column if not exists share_delta numeric;

comment on column public.telegram_issue_keyword.share_delta is
  '최근 3일 평균 점유율 − 5일 이상 이전 평균 점유율. ×100 이 %p. trend 와 같은 두 값에서 나오며 trend 는 여기에 flat 문턱만 더한 것';
