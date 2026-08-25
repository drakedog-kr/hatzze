-- Hatzze — 마이그레이션 049: 내부자 리포트의 모집단을 넓힌다
--
-- 화면이 "기업 임원 N명 · 미 하원의원 N명 · 월가 거물 N명"을 규모로 내세우는데,
-- 지금 그 수가 **우리가 걸어 둔 필터의 결과**라 실제보다 작다. 셋을 이렇게 넓힌다.
--
--   기업 임원   창 7일 → 90일          (스크립트만 고치면 된다. DDL 불필요)
--   월가 거물   30명 → 50명            (config/us_managers.py. DDL 불필요)
--   미 하원의원 카더라 종목만 → 신고한 사람 전원   ← **이 파일이 하는 일**
--
-- ## 왜 외래키를 떼나
--
-- 지금 us_congress_trade.ticker 가 us_stocks 를 참조한다. 그래서 카더라에 안 오른
-- 종목의 신고는 아예 못 담고, 그 필터가 **의원을 106명 → 52명으로 깎고 있었다.**
-- (2026년에 주식 매매를 신고한 하원의원 전원이 106명이다. 재산공시는 1,054명이 내지만
--  주식을 사고파는 사람은 그중 10% 뿐이다.)
--
--
-- ⚠️ 외래키를 떼면 티커 오타가 조용히 들어올 수 있다. 수집기가 하원 PDF 의 **소괄호**
--    안 값만 티커로 읽고 대괄호(자산유형 코드)는 버리므로, 그 규칙이 무너지지 않는 한
--    쓰레기가 들어올 자리는 없다. 규칙은 scripts/fetch_us_congress.py 머리말에 있다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.us_congress_trade
  drop constraint if exists us_congress_trade_ticker_fkey;

comment on column public.us_congress_trade.ticker is
  '⚠️ us_stocks 외래키를 뗐다(migration_049) — 카더라에 안 오른 종목의 신고도 담는다. 그 필터가 의원을 106명 → 52명으로 깎고 있었다';

-- 화면이 "카더라에 오른 종목인지"를 자주 가르므로 티커 인덱스를 그대로 둔다(이미 있음).
-- 사람 단위 집계("몇 명이 신고했나")도 자주 하므로 하나 더 얹는다.
create index if not exists us_congress_trade_member_idx
  on public.us_congress_trade (member, transaction_date desc);
