-- Hatzze — 마이그레이션 105: 화면을 비운 시각(첫 줄 '업데이트' 라벨)
--
-- ## 무엇을 고치나
--
-- 첫 줄 '업데이트' 라벨은 그 화면이 새로 바뀐 시각이어야 한다(2026-10-18). #763 은 그 시각을 화면의 조회 캐시에 담긴
-- 작은 응답의 시각(date 머리)에서 읽었는데, 운영 Vercel 에선 그 응답이 비울 때까지 굳지 않았다 — 2026-10-18 저녁
-- 파이프라인이 안 돌았는데도 배포(#764) 즈음에 카더라 · 미리보기 · 테마 라벨이 '오후 7시 30분'에서 '오후 8시'로 바뀌었다.
--
-- 그래서 비운 시각을 DB 에 적는다. /api/revalidate 가 화면을 비우기 **직전에** 비운 자리마다 지금 시각을 여기 적고,
-- 화면은 제 자리의 줄을 읽어 라벨로 쓴다. 값은 다음에 그 자리를 비울 때만 바뀐다 — 배포 · 캐시를 다시 받아도 같다.
--
-- ## 칸
--
--   target        비운 자리. 세 꼴이다.
--                   '/kadera'          그 경로 한 장(API 의 paths — revalidatePath(경로))
--                   '/theme/[theme]'   그 꼴의 화면 전부(API 의 routes — revalidatePath(패턴, "page"))
--                   '/kadera/*'        그 최상위 자리 아래 전부(API 의 except — 뺀 자리 말고 나머지 최상위 자리마다)
--                   '*'                전부(본문 없는 호출 — revalidatePath("/", "layout"))
--                 홈은 최상위 자리도 그 한 장뿐이라 '/' 로 적는다(lib/revalidate-paths.ts segmentTarget).
--   refreshed_at  그 자리를 마지막으로 비운 때
--
-- 화면은 제 경로 · 제 최상위 자리('/x/*') · '*' 세 줄 가운데 가장 늦은 시각을 쓴다(lib/refreshed-at.ts).
-- ⚠️ 이 표가 없거나 줄이 없으면 화면은 예전 자료 시각으로 물러선다. 적다가 실패해도 /api/revalidate 는 비우기를 그대로 한다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.page_refresh (
  target text primary key,
  refreshed_at timestamptz not null default now(),
  check (target = '*' or target like '/%')
);

comment on table public.page_refresh is
  '화면을 비운 시각 — app/api/revalidate 가 비우기 직전에 적고, 첫 줄 ''업데이트'' 라벨이 읽는다(lib/refreshed-at.ts)';
comment on column public.page_refresh.target is
  '비운 자리: 경로(/kadera) · 패턴(/theme/[theme]) · 최상위 자리 아래 전부(/kadera/*) · 전부(*)';

alter table public.page_refresh enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 옆 표들과 같다.
