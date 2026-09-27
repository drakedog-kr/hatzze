-- Hatzze — 마이그레이션 087: 서학개미 장부 표 여섯과 daily_score.prev_score 를 지운다
--
-- ## 서학개미 표 여섯
-- 화면(/seohak)은 2026-09-22 에 내렸고(404), 수집 스텝은 09-26 에 워크플로에서 뺐다. 09-27 에 화면 코드
-- (app/seohak · lib/seohak-*)와 수집 스크립트(fetch_seohak_* 다섯 · calculate_seohak_* 둘)까지 걷었다.
-- 이제 아래 여섯 표를 읽는 곳도 쓰는 곳도 없다.
--
-- ⚠️ **seohak_etf_daily 는 남긴다.** 배당 화면 '국내 ETF' 줄이 이 표의 30일 순유입으로 순서를 정한다
--    (lib/dividend.ts getTrends). 수집(fetch_seohak_etf.py)은 배당 잡으로 옮겨 되살렸다.
--
-- ## daily_score.prev_score
-- 마이그레이션 025 에서 폐기 표시만 하고 칸은 남겼다("drop 은 되돌릴 수 없다"). 그 뒤로 읽는 곳도 채우는
-- 곳도 없고, 값은 2026-08-01~05 다섯 줄뿐이다.
--
-- ## 되돌릴 길
-- 지우기 전에 전부 JSON 으로 받아 두었다(2026-09-27, 레포 밖 ~/hatzze-db-backup-2026-09-27/):
--   seohak_country_flows 3,500 · seohak_equity_type 96 · seohak_institution_13f 24,649 ·
--   seohak_quarterly_returns 18 · seohak_settlement_daily 102,066 · seohak_settlement_yearly 33 ·
--   daily_score_prev_score 5
-- 표 구조는 마이그레이션 030·031·032·043·044 에 그대로 있다.
--
-- Supabase SQL Editor 에서 실행하세요. **이 마이그레이션을 담은 PR 이 배포된 뒤에** 돌립니다 — 먼저 돌려도
-- 지금 배포된 화면은 이 표를 안 읽지만(/seohak 은 이미 404), 순서를 지키면 따질 것이 없습니다.

drop table if exists public.seohak_country_flows;
drop table if exists public.seohak_equity_type;
drop table if exists public.seohak_institution_13f;
drop table if exists public.seohak_quarterly_returns;
drop table if exists public.seohak_settlement_daily;
drop table if exists public.seohak_settlement_yearly;

alter table public.daily_score drop column if exists prev_score;
