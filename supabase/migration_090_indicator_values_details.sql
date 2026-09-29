-- Hatzze — 마이그레이션 090: indicator_values.details 컬럼
--
-- 카드의 보조 숫자('평소 대비 1.3배'·금 종가 날짜·Hit 기준선 등)를 담는 JSONB 컬럼이다.
-- 운영 DB 에는 있는데 만든 기록이 어느 schema·migration 에도 없었다(lib/data.ts 가
-- "details 컬럼이 아직 없는 환경(마이그레이션 전)"이면 빼고 다시 읽는 게 그 흔적이다).
-- 그래서 이 레포로 새 환경을 만들면 fetch 스크립트의 details upsert 를 PostgREST 가 거절하고,
-- details 를 함께 읽는 calculate_score·check_freshness 조회도 실패해 점수와 발송 게이트가
-- 선다. 화면은 details 없이 다시 읽어 버티므로 파이프라인이 돌기 전까지는 드러나지 않는다.
--
-- 운영 DB 에서는 no-op 이다(add column if not exists). 앞으로 만들 환경이 같은 상태가 되도록
-- 기록을 남긴다. data-pipeline/tests/test_schema_contract.py 가 이 컬럼이 있는지 본다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.indicator_values
  add column if not exists details jsonb;

comment on column public.indicator_values.details is '카드 보조 숫자(평소 대비 배수·기준선 등). fetch 스크립트와 calculate_score.py가 각자 자기 키만 병합해 쓴다(common/details.py)';
