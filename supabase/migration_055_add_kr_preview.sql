-- Hatzze — 마이그레이션 055: 국장 미리보기 일별 카드
--
-- 간밤 미장에서 평소보다 크게 움직인 종목과, 그 종목과 사업으로 엮인 국내 종목을
-- 개장 전에 잇는다. 재료는 `data-pipeline/config/us_kr_pairs.py`(관계 153쌍 + 평소 폭)
-- 이고, 간밤 등락만 매일 새로 받는다.
--
-- ## 왜 표를 두나 (읽는 시점에 계산하지 않는 이유)
--
-- 1. **핀허브 무료가 분당 60건이다.** 사전의 미국 70종목을 한 번에 못 받는다(실측: 60개까지
--    받고 나머지가 429). 간격을 두면 70초쯤 걸리는데, 그걸 방문자마다 할 수는 없다.
-- 2. 사전이 파이썬에 있다. 프론트가 읽으려면 TS 사본을 두어야 하는데, 이 저장소는 그
--    쌍둥이가 어긋나는 걸 이미 여러 번 겪었다(lib/stock-themes.ts 주석). **파이프라인이
--    완성된 줄을 넣어 두면 사본 자체가 필요 없다.**
--
-- ## 한 줄 = 한 쌍이다
--
-- 미국 종목 하나에 국내 종목이 여럿 붙으므로 `us_dp`·`us_z` 는 그만큼 되풀이된다. 하루
-- 40줄 남짓이라 되풀이의 값이 싸고, 대신 조회가 단순해진다(telegram_us_comention 과 같은 꼴).
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.kr_preview_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  ticker text not null references public.us_stocks (ticker),
  us_name text not null,
  sector text not null,
  us_dp numeric not null,
  us_z numeric not null,
  stock_code text not null references public.stocks (code),
  stock_name text not null,
  why text not null,
  gap numeric not null,
  events integer not null,
  created_at timestamptz not null default now(),
  unique (date, ticker, stock_code)
);

comment on table public.kr_preview_daily is '국장 미리보기 — 간밤 크게 움직인 미국 종목과 사업으로 엮인 국내 종목. 한 줄이 한 쌍이고 매 실행 그날 것을 갈아 끼운다';
comment on column public.kr_preview_daily.date is '⚠️ **국내 거래일**(KST) 기준이다. 간밤 미장은 그 전날 세션이라 미국 날짜와 하루 어긋난다 — 화면에서 "그날 미장"이라고 쓰지 말 것';
comment on column public.kr_preview_daily.sector is 'config/us_stock_themes.py 의 미국 테마. 화면이 이걸로 묶는다';
comment on column public.kr_preview_daily.us_dp is '간밤 등락률(%). 핀허브 quote 의 dp 그대로 — 사람이 아는 숫자라 초과분이 아니라 이 값을 보인다';
comment on column public.kr_preview_daily.us_z is '⭐ 그 종목 평소 폭의 몇 배인가. |dp − 베타×S&P dp| / 표준편차(config 의 US_VOL). 등락률만으로는 큰 움직임인지 알 수 없어서 둔다 — KO 의 3%와 블룸에너지의 3%는 다른 일이다';
comment on column public.kr_preview_daily.why is '두 회사가 어떤 관계인가(공급·동종 등). 사전에 적힌 한 줄을 그대로 옮긴다';
comment on column public.kr_preview_daily.gap is '⭐ 과거에 이런 날 국내 종목의 개장 갭이 **코스피보다** 얼마나 더 컸는지의 평균(%p, 5년). ⚠️ "코스피보다"를 빼면 그냥 오른 것과 구별이 안 된다 — 화면 문구에서 이 단서를 지우지 말 것';
comment on column public.kr_preview_daily.events is '그 평균을 낸 표본 수. 중앙값 68건이라 적중률로 바꿔 쓰면 오차가 ±6%p 다 — 크기와 횟수로만 말한다';

create index if not exists kr_preview_daily_date_idx on public.kr_preview_daily (date desc);

-- 종목명·관계는 비밀이 아니고 프론트가 바로 읽는다(stocks·us_stocks 와 같은 정책).
alter table public.kr_preview_daily enable row level security;
drop policy if exists "kr_preview_daily public read" on public.kr_preview_daily;
create policy "kr_preview_daily public read" on public.kr_preview_daily for select using (true);
