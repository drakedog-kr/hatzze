-- 텔레그램 채널 글 2판(갈래 요약)의 갈래 저장.
--
-- 아침·저녁 글이 세운 갈래(제목·본문·종목)를 남겨 두면 수·일 글이 그걸 재료로 쓴다 —
-- 사흘·닷새치를 원문에서 다시 요약하지 않아도 되고, 하루 요약과 주간 요약이 같은 이름으로
-- 같은 이야기를 부른다(common/broadcast_digest.py 머리말). 표가 없어도 발송은 돈다
-- (저장은 조용히 건너뛰고 수·일 글은 원문 발췌만으로 만든다). 저장은 실제 발송 때만.
--
-- ⚠️ 번호 070 은 2026-09-09 기준으로 비어 있던 것이다. 머지 직전에 origin/main 을 다시 볼 것
--    (PR 대기 중에 남이 가져갈 수 있다 — 066/067 이 그랬다).

create table if not exists public.telegram_daily_digest (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot text not null check (slot in ('morning', 'evening', 'midweek', 'us_weekend', 'weekly')),
  sections jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  unique (date, slot)
);

comment on table public.telegram_daily_digest is
  '텔레그램 채널 글 2판이 세운 갈래(LLM). 수·일 글의 [지난 요약] 재료. 화면에는 아직 안 쓴다';
comment on column public.telegram_daily_digest.date is
  '글의 기준일(KST). 아침 글은 밤이 끝난 날, 저녁 글은 그날, 주간 글은 창이 끝난 토요일';
comment on column public.telegram_daily_digest.sections is
  '[{title, body, kr:[종목코드], us:[티커]}] — 갈래 순서대로';

create index if not exists tg_daily_digest_date_idx
  on public.telegram_daily_digest (date desc);

alter table public.telegram_daily_digest enable row level security;
