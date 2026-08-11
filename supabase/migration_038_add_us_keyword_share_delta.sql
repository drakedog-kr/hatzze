-- Hatzze — 마이그레이션 038: 이슈 키워드의 점유율 변동폭(%p)
--
-- ## 왜 trend 로는 안 되나
--
-- 이미 `trend` 열이 있다. 그런데 그 값은 up/flat/down 셋 중 하나라 **방향만** 말한다.
-- 카드 위 하이라이트 칸이 물어야 하는 것은 "어느 화제어가 **가장 크게** 움직였나"라,
-- 방향만으로는 후보를 고를 수가 없다(같은 up 이 열 줄이면 무엇을 세울지 못 정한다).
--
-- ## 왜 화면에서 계산하지 않나
--
-- 재료(telegram_us_keyword_daily)는 화면도 읽을 수 있다. 그런데 그러려면 '최근 3일 vs
-- 5일 이상 이전'이라는 **창 규칙을 파이썬과 TS 양쪽에 두 벌** 두게 된다. 이 저장소는
-- 그 쌍둥이가 조용히 갈리는 것을 이미 겪었다. 파이프라인은 이 값을 계산하는 자리에서
-- 이미 recent_avg·prior_avg 를 손에 들고 있으므로, 빼기 한 번을 저장하는 편이 싸다.
-- (`trend` 도 같은 두 값에서 나온다 — 문턱 ISSUE_KEYWORD_FLAT 이 붙는 것만 다르다.)
--
-- ## 단위
--
-- 하루의 몫 = 그 화제어 언급 수 / 그날 미국 화제어 언급 합. 그 몫의 창 평균 차이라
-- 화면에서 100을 곱하면 %p 다. 테마 로테이션의 유입·이탈 칸과 같은 단위·같은 읽는 법.
--
-- null 이 정상값이다 — 비교할 과거 창이 아직 없으면(수집 초기·연휴) 못 낸다.
-- 그때 카드는 이 칸을 "비교할 과거가 없습니다"로 적는다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.telegram_us_issue_keyword
  add column if not exists share_delta numeric;

comment on column public.telegram_us_issue_keyword.share_delta is
  '최근 3일 평균 점유율 − 5일 이상 이전 평균 점유율. ×100 이 %p. trend 와 같은 두 값에서 나오며 trend 는 여기에 flat 문턱만 더한 것';
