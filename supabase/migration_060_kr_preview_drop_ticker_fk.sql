-- Hatzze — 마이그레이션 060: 국장 미리보기의 미국 티커 외래키를 뗀다
--
-- ## 무엇이 막혔나
--
-- `kr_preview_daily.ticker` 가 `us_stocks(ticker)` 를 참조한다(055). 그런데 쌍 사전을
-- 158쌍으로 늘리면서 미국 종목이 78개가 됐고, 그중 **열 개가 그 표에 없다.**
--
--   AAL DAL   → 대한항공
--   MPC PSX OXY SLB → S-Oil · GS · 흥구석유
--   LHX       → 한화시스템
--   PLUG      → 두산퓨얼셀
--   RUN SEDG  → HD현대에너지솔루션 · 한화솔루션
--
-- 외래키라 한 줄이 걸리면 그날 저장이 통째로 실패한다. 정유·항공처럼 독자가 가장 쉽게
-- 이해하는 쌍들이 여기 몰려 있다.
--
-- ## ⛔ us_stocks 에 티커를 더해 푸는 길은 아니다
--
-- 그 표는 미장 카더라의 종목 추출 사전(`config/us_stock_extraction.py`)이 채운다.
-- 사전에 이름을 더하면 본문 매칭 규칙이 하나 늘어 오탐이 들어온다("비자"→H-1B 비자
-- 297건 · "블록"→더 블록 198건). 의원 축이 migration_049 에서, 거물 보유가
-- migration_051 에서 **똑같은 이유로 이미 이 외래키를 뗐다.** 세 번째다.
--
-- ⚠️ 덤으로 그 표는 `fetch_us_analyst`·`fetch_us_insider` 의 **작업 목록**이기도 하다.
--    티커를 더하면 내부자 리포트의 애널리스트 순위에 이 열 곳이 같이 올라온다.
--    화면 하나를 고치려다 남의 화면 내용이 바뀐다.
--
-- ## 이름은 어디서 오나
--
-- 수집기가 us_stocks → `config/us_kr_pairs.py` 의 `US_NAMES` → 티커 순으로 찾는다.
-- 표에 있으면 그쪽이 이기므로, 나중에 카더라 사전이 같은 종목을 담아도 안 어긋난다.
--
-- ⚠️ 외래키를 떼면 티커 오타가 조용히 들어올 수 있다. 여기서는 티커의 출처가 손으로 쓴
--    사전 하나뿐이고 그 값으로 핀허브를 부르므로, 오타면 시세를 못 받아 먼저 드러난다.
--    `stock_code` 쪽 외래키(→ stocks)는 그대로 둔다. 그건 KRX 정식 목록이라 맞다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.kr_preview_daily
  drop constraint if exists kr_preview_daily_ticker_fkey;

comment on column public.kr_preview_daily.ticker is
  '미국 종목 티커. ⚠️ migration_060 부터 us_stocks 외래키가 없다 — 쌍 사전(config/us_kr_pairs.py)이 그 표보다 넓다. 한글 이름은 us_stocks → US_NAMES → 티커 순으로 찾는다';
