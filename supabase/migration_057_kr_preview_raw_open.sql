-- Hatzze — 마이그레이션 057: 국장 미리보기를 '보통 몇 % 열렸나' 로 말하게 한다
--
-- ## 왜 또 바꾸나
--
-- 056 에서 넣은 '173번 중 130번' 도 안 읽혔다. 미국 줄이 "+2.38%" 인데 바로 밑 국내 줄이
-- "173번 중 130번" 이면 두 숫자가 같은 종류로 안 보인다 — 무엇을 어쩌라는 건지 모른다.
--
-- 사람이 한 번에 읽는 형태는 **같은 단위의 퍼센트**다.
--
--     셰브론 +2.38%  →  이런 날 흥구석유는 보통 +2.25% 열렸습니다
--
-- ⚠️⚠️ **`kospi_open` 을 반드시 함께 낸다.** +2.25% 만 있으면 이 종목 덕인지 그날 시장이
--    좋아서인지 구별이 안 된다. 같은 날들의 코스피 개장 평균(−0.15%)이 옆에 있어야
--    읽는 사람이 가늠한다. 하나만 쓰지 말 것.
--
-- ## 기존 컬럼은 어떻게 되나
--
--   gap          국내 **초과** 개장 갭 평균(%p). 쌍을 고르고 검증하는 기준이라 남긴다.
--                화면에는 안 낸다 — 사람이 읽는 숫자가 아니다.
--   wins·base    056 에서 넣은 횟수. 화면에서는 뺐지만 사전이 이 값으로 쌍을 거르므로
--                기록으로 남긴다(평소 이하인 쌍은 사전 단계에서 이미 빠진다).
--
-- 값의 출처는 `data-pipeline/config/us_kr_pairs.py` 의 `Pair.up` / `Pair.down` 이고,
-- 2026-09-02 에 최근 5년으로 방향을 갈라 쟀다(`backtest/kr_preview_pairs.py`).
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.kr_preview_daily
  add column if not exists kr_open numeric,
  add column if not exists kospi_open numeric;

comment on column public.kr_preview_daily.kr_open is '⭐ 과거 그런 날 이 국내 종목의 **날것** 개장 갭 평균(%). 화면이 "보통 +2.25% 열렸습니다" 로 읽는다';
comment on column public.kr_preview_daily.kospi_open is '⭐⭐ **같은 날들의 코스피 개장 갭 평균(%).** kr_open 과 항상 같이 낸다 — 옆에 이게 없으면 +2.25%가 이 종목 덕인지 그날 장이 좋아서인지 구별이 안 된다';

-- ⚠️ 기존 줄에는 값이 없다(nullable). 파이프라인이 매 실행 그날 것을 통째로 갈아 끼운다.
