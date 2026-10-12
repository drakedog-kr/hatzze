-- Hatzze — 마이그레이션 098: 관심의 폭을 창 두 벌로 (급부상 저녁 창)
--
-- ## 무엇을 고치나
--
-- telegram_stock_breadth(마이그레이션 028)는 **종목코드 하나가 열쇠**라 종목마다 창 한 벌만 둔다.
-- 028 을 만들 때는 그걸로 충분했다. 화면 두 자리(주요 종목 리포트 · 급부상)가 같은 창을 썼다.
--
-- 마이그레이션 086 뒤로 급부상은 저녁 실행 뒤 **오늘까지** 넣어 센다. 그래서 저녁엔 창이 갈린다.
--   · 주요 종목 리포트   기준일 하루 전에서 끝나는 3일   (2026-10-12 저녁: 10-09~10-11)
--   · 급부상             기준일에서 끝나는 3일           (2026-10-12 저녁: 10-10~10-12)
-- 표에는 리포트 창만 있어서 저녁 급부상 카드는 저장값을 못 쓰고 렌더마다 조인으로 직접 셌다
-- (lib/telegram-data.ts recentChannelCount 의 느린 길 · SK하이닉스 4.1초). 그 조인이 DB 5xx 를 내면
-- 빌드가 /kadera 를 못 그려 배포가 실패한다(2026-10-12 PR #716 프리뷰).
--
-- 저녁 급부상 카드 10종목 가운데 셋(이엠앤아이 · 금호건설 · 한화갤러리아)은 리포트 창 언급 상위 60
-- 에도 없었다. 그래서 급부상 창은 그 카드 종목을 따로 적는다(scripts/generate_surging_oneliners.py).
-- SK하이닉스처럼 두 자리에 다 오르는 종목은 창마다 한 줄씩, 두 줄이 된다.
--
-- ## 무엇을 바꾸나
--
-- 열쇠를 (종목코드, 창 시작, 창 끝) 으로 넓힌다. 열은 그대로다. 화면은 창을 대조해서 읽으므로
-- (storedBreadth 의 window_start · window_end 조건) 한 줄도 안 바뀐다.
--
-- ⚠️ **코드를 먼저 머지하고 이걸 실행한다.** 예전 코드는 on_conflict=stock_code 로 쓰는데, 열쇠가
--    바뀌면 그 쓰기가 42P10 으로 실패한다. 그 직전에 지난 창 행을 지우므로, 창이 넘어가는 아침
--    실행이면 표가 빈다. 새 코드는 098 전 표를 만나면 예전처럼 종목코드로 쓴다
--    (generate_telegram_narratives._breadth_upsert). 그래서 머지가 먼저면 실행 시점은 아무 때나 된다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.telegram_stock_breadth
  drop constraint if exists telegram_stock_breadth_pkey;

alter table public.telegram_stock_breadth
  add constraint telegram_stock_breadth_pkey primary key (stock_code, window_start, window_end);

comment on table public.telegram_stock_breadth is
  '종목별 관심의 폭(창 안 서로 다른 채널 수). 렌더마다 조인해 세지 않도록 파이프라인이 미리 계산해 둔다. 창이 주요 종목 리포트(기준일 전날 끝)와 저녁 급부상(기준일 끝) 두 벌일 수 있다';
