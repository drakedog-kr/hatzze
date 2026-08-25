-- Hatzze — 마이그레이션 051: 거물 보유의 종목 필터를 뗀다
--
-- 지금 us_manager_holding.ticker 가 us_stocks 를 참조한다. 그래서 **카더라에 오른
-- 종목만** 담기고, 그 필터가 62명 중 8명의 보유를 통째로 0건으로 만들고 있었다.
--
--   보유 0건: 칼 아이칸 · 넬슨 펠츠 · 가이 스파이어 · 그린헤이븐 · 제이나 파트너스 ·
--             게이츠 캐피털 · 알타 폭스 · 폴리탄 캐피털
--
-- 여덟 곳 모두 13F 는 정상 제출했다. 아이칸이 드는 IEP·CVI 가 카더라에 안 오를 뿐이다.
-- 화면이 "월가 거물 62명"을 규모로 내세우는데 그중 8명이 아무것도 못 내고 있었다.
--
-- ## ⛔ us_stocks 에 티커를 더해 푸는 길은 없다
--
-- 그 표는 카더라 추출 사전(config/us_stock_extraction.py)이 **매 실행 통째로 덮어쓴다**
-- (extract_telegram_us_stocks.py). 손으로 넣은 행은 다음 실행에 사라진다.
-- 사전 쪽에 이름을 더하면 이번엔 본문 매칭 규칙이 하나 늘어 오탐이 들어온다
-- ("비자"→H-1B 비자 297건 · "블록"→더 블록(매체) 198건).
--
-- 의원 축(us_congress_trade)이 똑같은 이유로 migration_049 에서 이미 외래키를 뗐다.
--
-- ## ⚠️ 외래키를 떼면 티커 오타가 조용히 들어올 수 있다
--
-- 그래서 수집기의 잇는 방식을 같이 바꿨다. 예전엔 **회사명**으로 이었는데, SEC 티커 표
-- 10,387개를 정규화하면 1,447개 키가 겹쳐서(`GOOG`/`GOOGL` · `JPM`/`JPM-PC` ·
-- `ASML`/`ASMLF`) 먼저 온 놈이 조용히 이겼다. 이제 **CUSIP** 으로 잇는다 —
-- SEC 의 fails-to-deliver 파일이 CUSIP↔티커를 준다. 실측 커버율 99%이고,
-- 못 이은 1%는 전부 전환사채라 빠지는 게 맞다(자세한 건 scripts/fetch_us_13f.py 머리말).
--
-- 규모: 62명의 최신 분기 보유 합계가 2,780종목이다. 두 분기를 쌓으므로 5천 행대가 된다.
-- 046 이 적어 둔 "1만 종목이 넘는다"는 지수형(시타델 4,885 · 포인트72 2,302 …)을
-- 빼기 전 숫자라 이미 낡았다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.us_manager_holding
  drop constraint if exists us_manager_holding_ticker_fkey;

comment on table public.us_manager_holding is
  '거물이 보유한 종목. ⚠️ migration_051 부터 **us_stocks 필터 없이 전부** 담는다 — 그 필터가 62명 중 8명을 0건으로 만들고 있었다. 분기는 migration_050 부터 쌓는다';
comment on column public.us_manager_holding.ticker is
  '⚠️ us_stocks 외래키를 뗐다(migration_051). 수집기가 **CUSIP** 으로 티커를 잇는다(회사명 매칭은 GOOG/GOOGL 을 뒤집고 전환사채를 보통주에 합산했다)';
comment on column public.us_manager_holding.cusip is
  '13F 가 티커 대신 주는 식별자. ⭐ migration_051 부터 이게 **티커를 정하는 키**다. 화면에는 안 띄운다';

-- 카드가 "이 종목을 몇 명이 어느 쪽으로 움직였나"를 티커로 묶는다. 이미 ticker 인덱스가
-- 있으니(046) 그대로 쓰고, 분기 비교용 (cik, ticker, report_date) 은 050 에서 얹었다.
