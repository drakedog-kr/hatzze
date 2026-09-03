-- Hatzze — 마이그레이션 063: 국장 미리보기의 **그날치 한 줄**
--
-- ## 무엇을 고치나
--
-- `kr_preview_daily` 는 **종목 줄**만 담는다. 그래서 밤사이 크게 움직인 종목이 하나도
-- 없는 날에는 그날 줄이 **한 개도 안 생긴다.** 화면은 "표에서 가장 최근 날짜" 를 찾아
-- 그리므로, 그런 날 방문자는 **어제 화면을 본다** — 어제 종목들이 그대로 뜨고 히어로의
-- S&P 숫자까지 어제 것이다.
--
-- 더 나쁜 것은 그런 날을 위해 써 둔 문구가 영영 안 뜬다는 점이다. "밤사이 크게 움직인
-- 종목이 없습니다 … 고장이 아니라 조용한 밤이었습니다" 는 종목 수가 0 일 때 뜨는데,
-- 화면이 보고 있는 것은 어제 줄이라 0 이 아니다. 그 가지는 **표가 통째로 비었을 때**,
-- 즉 처음 배포한 날에만 닿는다.
--
-- ⚠️ 화면 쪽에서 "오늘 날짜가 아니면 빈 날" 로 판정할 수는 없다. 아침 실행(07:01) 전에
--    어제 것을 보여 주는 건 **의도한 동작**이라(lib/kr-preview.ts 주석), 날짜만으로는
--    "아직 안 돌았다" 와 "돌았는데 없었다" 가 구별되지 않는다. 구별하려면 **돌았다는
--    기록이 남아야** 한다. 이 표가 그 기록이다.
--
-- ## 담기는 것
--
-- 하루에 한 줄. 종목이 몇이든(0 이어도) 아침 실행이 반드시 쓴다.
--
--   date      국내 거래일(KST). ⚠️ 간밤 미장은 그 전날 세션이라 미국 날짜와 하루 어긋난다.
--   spx_dp    그 아침 S&P 500 등락률(%). 히어로가 이 값으로 과거 구간을 고른다.
--   movers    그날 남은 미국 종목 수. 0 이면 조용한 밤이다.
--
-- ⭐ `spx_dp` 는 지금 `kr_preview_daily` 의 **줄마다** 되풀이돼 있다. 그건 그대로 둔다 —
--    지우면 이 마이그레이션과 코드 배포 사이에 화면이 지수를 잃는다. 화면은 이 표를
--    먼저 보고, 없으면 예전처럼 종목 줄에서 꺼낸다.
--
-- ## ⚠️ RLS 를 켜고 읽기 정책을 함께 준다
--
-- 화면은 `SUPABASE_PUBLISHABLE_KEY` 로 읽는다. RLS 만 켜고 정책을 안 주면 그 키가 막혀
-- 화면이 통째로 빈다. `kr_preview_daily`(055) · `kr_overnight`(062)와 같은 모양이다.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.kr_preview_day (
  date       date        primary key,
  spx_dp     numeric     not null,
  movers     integer     not null default 0,
  created_at timestamptz not null default now()
);

alter table public.kr_preview_day enable row level security;

drop policy if exists "kr_preview_day public read" on public.kr_preview_day;
create policy "kr_preview_day public read" on public.kr_preview_day for select using (true);

comment on table public.kr_preview_day is '국장 미리보기의 그날치 한 줄. ⭐ 종목이 0개인 날에도 반드시 쓴다 — 이 줄이 없으면 화면이 어제 날짜를 최신으로 잡아 어제 종목을 그대로 보여 준다';
comment on column public.kr_preview_day.spx_dp is '그 아침 S&P 500 등락률(%). 히어로가 이 값으로 과거 같은 구간의 코스피 성적을 고른다';
comment on column public.kr_preview_day.movers is '그날 남은 미국 종목 수. 0 이면 조용한 밤이고, 화면이 그 문구로 간다';
