-- Hatzze — 마이그레이션 067: 데일리 노트(/daily) — 하루 한 편의 시장 정리 글
--
-- ## 무엇을 담나
--
-- 매일 저녁 세션에서 손으로 쓰는 긴 글 한 편(hatzze_MMDD_post.md)과 그 짧은 판이다.
-- 지금까지 이 글은 세션 임시 폴더에만 남아 어디에도 저장되지 않았다. 화면(/daily)이
-- 읽을 곳이 필요해 표를 만든다.
--
-- ## 왜 마크다운 원문을 그대로 넣나
--
-- 올리는 쪽(data-pipeline/scripts/publish_daily_note.py)이 HTML 로 바꿔 넣으면, 화면의
-- 조판을 바꿀 때마다 지난 글을 전부 다시 올려야 한다. 원문을 두면 조판은 화면 코드
-- 한 곳(lib/daily-note-md.ts)에서 바뀌고 지난 글도 같이 따라온다.
--
-- 제목과 날짜는 본문에서 떼어 열로 둔다 — 화면이 제목·날짜를 자기 자리(머리)에 그리고,
-- 목록(지난 노트)은 본문을 안 읽고 이 두 열만 읽는다.
--
-- ## 하루에 한 줄
--
-- `date` 가 기본 키다. 같은 날 다시 올리면 덮어쓴다(upsert). 고친 원고를 반영하는 길이
-- 이것뿐이다 — 로그인이 없어 화면에서 고칠 수 없다.
--
-- ## ⚠️ RLS 를 켜고 읽기 정책을 함께 준다 (063 과 같은 모양)
--
-- 화면은 SUPABASE_PUBLISHABLE_KEY 로 읽는다. RLS 만 켜고 정책을 안 주면 그 키가 막혀
-- 화면이 통째로 빈다. 쓰기 정책은 두지 않는다 — 올리는 스크립트는 서비스 키를 쓰고,
-- 공개 키로는 읽기만 되어야 한다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.daily_note (
  date        date        primary key,
  title       text        not null,
  body_md     text        not null,
  short_md    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.daily_note enable row level security;

drop policy if exists "daily_note public read" on public.daily_note;
create policy "daily_note public read" on public.daily_note for select using (true);

comment on table public.daily_note is
  '데일리 노트(/daily). 매일 저녁 손으로 쓰는 시장 정리 글 한 편. 마크다운 원문을 그대로 두고 화면이 그릴 때 푼다(lib/daily-note-md.ts). 하루 한 줄이고 같은 날 다시 올리면 덮어쓴다';
comment on column public.daily_note.date is
  '글의 날짜(KST). 원고 둘째 줄 "## 2026년 9월 5일 토요일" 에서 뽑는다';
comment on column public.daily_note.title is
  '원고 첫 줄(# 제목). 본문(body_md)에는 들어 있지 않다';
comment on column public.daily_note.body_md is
  '제목·날짜 줄을 뗀 본문 마크다운. 쓰이는 문법은 ###·문단·---·표뿐이라 화면이 작은 변환기로 푼다';
comment on column public.daily_note.short_md is
  '같은 날의 짧은 판(500~600자). 아직 화면에 안 낸다 — 공유 카드나 목록 요약에 쓸 자리';
comment on column public.daily_note.updated_at is
  '마지막으로 올린 시각. 스크립트가 upsert 마다 now() 를 넣는다(고친 원고를 다시 올린 때가 남는다)';
