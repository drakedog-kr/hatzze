-- Hatzze — 마이그레이션 020: 메시지 분류를 Batch API 로 옮기기 위한 in-flight 추적표
--
-- analyze_telegram_messages.py 를 동기 호출에서 Anthropic Batch API 로 바꾼다.
-- 같은 모델·같은 프롬프트·같은 결과인데 토큰 값이 절반이다(응답 시각을 저쪽이 정하는
-- 대가). 채널이 12개에서 317개로 늘며 분류 비용이 $49/월까지 올라가서, 품질을 깎지
-- 않는 절감 수단 중 가장 큰 것부터 적용하는 것이다.
--
-- 왜 표가 필요한가: 제출과 수거가 다른 실행에서 일어난다. 그사이 어떤 메시지가
-- 처리 중인지 모르면, 다음 실행이 같은 메시지를 다시 제출해 **두 번 돈을 낸다.**
-- 그래서 배치 ID와 "이 배치가 무엇을 담고 있는지"를 남긴다.
--
-- payload 구조 — 요청 하나에 메시지 15건을 묶어 보내므로(시스템 프롬프트 오버헤드를
-- 분산), custom_id 만으로는 어느 메시지인지 되짚을 수 없다:
--   { "g0001": [["FastStockNews", 12345], ["bornlupin", 678], ...] }
--   배열 순서 = 프롬프트의 "### 번호" 순서.
--
-- 수거가 끝난 행은 collected_at 이 채워진다. 지우지 않고 남겨 두는 이유는 비용 추적
-- (request_count·message_count)과 중복 제출 사고의 사후 확인 때문이다.
--
-- ※ 다른 telegram_* 와 동일하게 비공개(RLS 켜되 공개 read 정책 없음).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.telegram_analysis_batches (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null unique,
  submitted_at timestamptz not null default now(),
  collected_at timestamptz,
  request_count integer not null,
  message_count integer not null,
  payload jsonb not null,
  note text
);

comment on table public.telegram_analysis_batches is
  '분류용 Anthropic Batch API 의 in-flight 배치. 제출→수거가 다른 실행에서 일어나므로 같은 메시지를 두 번 제출하지 않기 위한 추적표';
comment on column public.telegram_analysis_batches.batch_id is
  'Anthropic 배치 ID(msgbatch_...). 이걸로 상태 조회·결과 수거';
comment on column public.telegram_analysis_batches.collected_at is
  '결과를 다 받아 telegram_message_analysis 에 반영한 시각. null 이면 아직 처리 중(=이 배치의 메시지는 재제출 금지)';
comment on column public.telegram_analysis_batches.payload is
  '{custom_id: [[channel_handle, message_id], ...]} — 요청 하나가 담은 메시지들, 프롬프트의 ### 번호 순서';

-- 미수거 배치를 매 실행 조회한다.
create index if not exists telegram_analysis_batches_pending_idx
  on public.telegram_analysis_batches (collected_at)
  where collected_at is null;

alter table public.telegram_analysis_batches enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근.
