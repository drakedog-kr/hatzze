-- Hatzze — 마이그레이션 062: 국내 장이 닫힌 동안 밖에서 붙은 값
--
-- ## 무엇을 담나
--
-- 국내 장은 15:30 에 닫고 다음 날 09:00 까지 값이 멈춘다. 그 열일곱 시간 반 동안 삼성전자와
-- SK하이닉스·현대차는 하이퍼리퀴드(빌더 마켓 `xyz`)에서 **계속 거래된다.** 달러로 매겨진
-- 그 값을 환율로 되돌려 직전 거래일 종가와 견준 것이 이 표다.
--
-- ⭐ 실측(2026-09-03) — 오전 8시 선물과 전날 15시 값을 견줘 그날 실제 개장 갭과 맞춰 본 것.
--      삼성전자    131일  상관 0.962  방향 일치 94.7%  기울기 0.97
--      SK하이닉스  132일  상관 0.965  방향 일치 90.2%  기울기 1.02
--      현대차      131일  상관 0.941  방향 일치 89.3%  기울기 0.91
--      코스피200    66일  상관 0.866  방향 일치 86.4%  기울기 0.62  ← 얇아서 뺐다
--
-- ⚠️ 그래서 문구를 조심해야 한다. "오를 것" 으로 쓰면 이 저장소가 지켜 온 선을 넘는다.
--    화면은 "밖에서는 지금 얼마에 거래되고 있다" 는 사실만 적는다.
--
-- ## ⚠️ 이 표를 채우는 스텝은 KRX 08:00 게이트 **뒤**다
--
-- 견줄 기준이 직전 거래일 종가인데 KRX 는 그걸 08:00 KST 에 올린다. 게이트 앞에 두면 한
-- 세션 낡은 종가와 견주게 되고 화면에서는 티가 안 난다. 그리고 선물 값은 09:00 에
-- 가까울수록 정보가 많다 — 같은 잡의 `fetch_kr_preview`(맨 앞)와 정반대다.
--
-- ⚠️ 수집기는 `stocks` 표를 읽지 않고 KRX 를 직접 부른다. 그 표를 채우는
--    `fetch_krx_stocks` 가 게이트 **앞**이라 아침에는 낡아 있기 때문이다.
--
-- ## ⚠️ RLS 를 켜고 읽기 정책을 함께 준다
--
-- 화면은 `SUPABASE_PUBLISHABLE_KEY` 로 읽는다. RLS 만 켜고 정책을 안 주면 그 키가 막혀
-- 카드가 빈 화면이 된다. 파이프라인은 secret 키로 쓰므로 정책과 무관하게 그대로 쓴다.
--
-- Supabase SQL Editor에서 실행하세요. (2026-09-03 실행 완료)

create table if not exists public.kr_overnight (
  id               bigserial primary key,
  date             date        not null,
  code             text        not null,
  name             text        not null,
  symbol           text        not null,
  perp_usd         numeric     not null,
  usdkrw           numeric     not null,
  krw              numeric     not null,
  prev_close       numeric     not null,
  prev_close_date  date        not null,
  diff_pct         numeric     not null,
  open_interest    numeric,
  day_volume_usd   numeric,
  funding          numeric,
  captured_at      timestamptz not null,
  created_at       timestamptz not null default now(),
  unique (date, code)
);

create index if not exists kr_overnight_date_idx on public.kr_overnight (date desc);

alter table public.kr_overnight enable row level security;

drop policy if exists kr_overnight_read on public.kr_overnight;
create policy kr_overnight_read
  on public.kr_overnight for select
  to anon, authenticated
  using (true);

comment on table public.kr_overnight is '국내 장이 닫힌 동안 하이퍼리퀴드 무기한선물에 붙은 값. 하루 한 줄이 한 종목이고 매 실행 그날 것을 갈아 끼운다. ⭐ RLS 켜짐 — 읽기만 열려 있고 쓰기는 secret 키만 된다';
comment on column public.kr_overnight.symbol is '선물 심볼(예: xyz:SMSN). ⚠️ 빌더 배포 마켓이라 dex 이름까지 있어야 API 로 다시 찾을 수 있다';
comment on column public.kr_overnight.krw is '⭐ 화면이 내는 값. perp_usd × usdkrw 다';
comment on column public.kr_overnight.prev_close_date is '⚠️⚠️ 견준 종가가 **어느 날 것인지.** 이게 직전 영업일이 아니면 diff_pct 는 거짓이다 — 화면에서는 그럴듯해 보여 티가 안 난다';
comment on column public.kr_overnight.day_volume_usd is '24시간 거래대금($). 얇은 시장은 표시가가 값이 아니다 — 수집기가 100만 달러 문턱으로 거른다';
