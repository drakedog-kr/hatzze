-- Hatzze — 마이그레이션 044: 무엇을 들고 있나 (보통주 · 펀드·ETF · 우선주·기타)
--
-- 지금까지 이 화면은 "얼마나"(TIC 잔고) 와 "언제"(예탁원 일별) 만 말했다. **무엇을**
-- 들고 있는지는 못 말했다. 13F 는 기관 9곳뿐이고 예탁원 종목별은 법인 전용이라 막혀
-- 있는데, 종류 단위라면 미 재무부 연례 조사가 나라별로 그대로 준다.
--
-- 원천: TIC **SHL 연례 조사** Table A8(옛 A4)
--       `Foreign Holdings of U.S. Equities, by Country and Equity Type`
--       매년 6월 말 기준 · 이듬해 4월경 공표 · 2014~2025 열두 판
--
-- ## ⚠️⚠️ 이 표가 앞서 화면에 쓰던 숫자를 정정한다
--
-- 코드 주석과 설명에 "보통주 72.1% / 펀드·ETF 20.2% / 우선주 7.7%" 를 현재값처럼
-- 써 왔는데, 그건 **2014-06-30 조사**다(그때 한국 보유는 $59.0B 였다). 최신은
-- **62.9 / 20.6 / 16.4** 다($591.9B). 열한 해 동안 보통주가 9.2%p 빠지고 그만큼이
-- 우선주·기타로 갔다.
--
-- ## ⭐ 움직인 건 한국뿐이다 (그래서 비교 대상을 같이 담는다)
--
--   구간 2014 → 2025      보통주        펀드·ETF       우선주·기타
--   한국                 72.1 → 62.9   20.2 → 20.6    7.7 → 16.4   (−9.2 / +0.5 / +8.7)
--   전 세계              76.3 → 76.6   16.3 → 16.4    7.4 →  7.0   (+0.3 / +0.1 / −0.4)
--   일본                 79.2 → 82.4   19.0 → 16.7    1.8 →  0.9   (+3.2 / −2.3 / −0.9)
--
-- **전 세계는 열한 해 동안 사실상 제자리다.** 일본도 그렇다. 한국만 보통주에서 9.2%p 가
-- 빠져 그대로 우선주·기타로 갔고, 그 이동은 **2021년 한 해에 몰려 있다**(10.4→19.2).
-- ⭐ 같은 해 전 세계가 6.8→6.7 로 가만히 있었다는 대조가 결정적이다 — 이게 없으면
-- 조사 분류 기준이 바뀐 걸로 오해한다. 지금 한국의 '기타' 비중은 세계의 2.3배다.
--
-- ⚠️ **'우선주·기타'가 무엇인지는 원천이 더 안 쪼갠다.** 화면은 원천의 이름 그대로만
-- 쓰고 무엇이 들었는지 추측하지 않는다.
--
-- ## ⚠️ 파일 이름과 표 번호가 해마다 바뀐다
--
--   2014      appendix_tab04.csv        (Table A4)
--   2015~2019 shl_app04_YYYY.csv        (Table A4)
--   2020~2022 shl_app08_YYYY.csv        (Table A8 로 번호 이동)
--   2023~2025 shl_app08_data_YYYY.csv   (기계용 판이 따로 생김)
--
-- zip 이름도 제각각이다(shl2014r-appx · shla2016r-appx · shl_appendix_2025 …).
-- 그래서 페처는 이름을 짐작하지 않고 **표 안의 머리말 문구로 찾는다.**
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.seohak_equity_type (
  survey_year   integer not null,
  country_code  text not null,
  country_name  text not null,
  total_usd_mn  bigint,
  common_usd_mn bigint,
  funds_usd_mn  bigint,
  other_usd_mn  bigint,
  updated_at    timestamptz not null default now(),
  primary key (survey_year, country_code)
);

comment on table public.seohak_equity_type is
  '미 재무부 TIC SHL 연례 조사 Table A8 — 나라별 미국 주식 보유를 종류로 가른 값. 매년 6월 말 기준이고 이듬해 4월경 공표된다. 미국 정부 저작물이라 재배포 제약 없음';
comment on column public.seohak_equity_type.country_code is
  'TIC 국가 코드를 쓰지 않는다 — 이 표는 나라 이름 문자열만 준다. 화면이 쓰는 자체 코드(KR·WORLD·JP…)를 넣는다';
comment on column public.seohak_equity_type.common_usd_mn is
  '보통주(Common Stock). 백만 달러';
comment on column public.seohak_equity_type.funds_usd_mn is
  '펀드·ETF(Funds). ⭐ 한국 20.2→20.6%, 전 세계 16.3→16.4% 로 열한 해 동안 양쪽 다 제자리다. 이 칸이 아니라 우선주·기타가 움직였다';
comment on column public.seohak_equity_type.other_usd_mn is
  '우선주·기타(Preferred and Other). ⚠️ 원천이 더 안 쪼갠다 — 무엇이 들었는지 추측해 화면에 쓰지 말 것. ⭐ 한국만 2021년에 두 배로 뛰었다(10.4→19.2%). 같은 해 전 세계는 6.8→6.7 로 제자리라 분류 기준 변경이 아니다. 지금 한국은 16.4% 로 세계(7.0%)의 2.3배';

alter table public.seohak_equity_type enable row level security;

create policy "seohak_equity_type_public_read"
  on public.seohak_equity_type
  for select
  to anon, authenticated
  using (true);
