-- Hatzze — 마이그레이션 089: indicators.category 검사를 시장/감성으로
--
-- 지표 분류 이름을 정통/밈 → 시장/감성으로 바꿀 때 운영 DB 는 SQL Editor 에서 손으로 고치고
-- 레포에는 반영하지 않았다(lib/data.ts normalizeCategory 가 옛 이름을 받아 주는 게 그 흔적이다).
-- 그 결과 schema.sql 은 옛 이름만 받아서, 이 레포로 새 환경을 만들면 fetch 스크립트 25개가
-- ensure_indicator 의 첫 insert/update 에서 제약 위반(23514)으로 죽는다 — 지표가 하나도 안
-- 쌓이니 점수·요약·저녁 발송까지 줄줄이 선다. migration_019(daily_score.stage)와 같은 일이다.
--
-- 운영 DB 는 이미 새 이름으로 돌고 있으므로(ensure_indicator 가 실행마다 META 로 덮어쓴다)
-- 사실상 no-op 이지만, 앞으로 만들 환경이 같은 상태가 되도록 기록을 남긴다.
-- data-pipeline/tests/test_schema_contract.py 가 이 검사와 META 의 category 를 대조한다.
--
-- ⚠️ 운영 DB 에서 손으로 고친 제약의 이름이 다르면 아래 add 가 제약을 하나 더 만든다(둘 다
--    시장/감성을 받으므로 해는 없다). 실행 전후에 확인하려면:
--      select conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'public.indicators'::regclass and contype = 'c';
--
-- Supabase SQL Editor에서 실행하세요.

-- 옛 제약이 남아 있으면 새 이름으로 옮기는 update 부터 막히므로 먼저 푼다.
alter table public.indicators drop constraint if exists indicators_category_check;

-- 혹시 옛 이름이 남아 있으면 옮긴다(제약을 다시 걸기 전에). 짝은 normalizeCategory 와 같다.
update public.indicators set category = '시장' where category = '정통';
update public.indicators set category = '감성' where category = '밈';

alter table public.indicators
  add constraint indicators_category_check
  check (category in ('시장', '감성'));

comment on table public.indicators is '지표 메타데이터 (시장/감성 트랙 구분)';
