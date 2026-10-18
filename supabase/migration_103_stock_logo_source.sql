-- Hatzze — 마이그레이션 103: 국장 종목 로고를 어디서 받을지(판정표)
--
-- ## 무엇을 고치나
--
-- 종목 로고는 logo.dev 에 티커(`005930.KS` · `058470.KQ`)로 묻는다(/api/logo). 코스피는 82% 가 나오는데
-- 코스닥은 21% 뿐이라(2026-10-18 무작위 표본 300 · 100) 코스닥 종목 대부분이 머리글자 배지로 나왔다.
-- 같은 logo.dev 에 회사 홈페이지 **도메인**으로 물으면 티커로 없던 코스닥 237종목 중 159종목(67%)이 나온다.
-- 도메인은 거래소 상장회사 목록(KIND)의 '홈페이지' 칸에서 온다(코스닥 1,819사 중 1,678사).
--
-- 파이프라인(scripts/refresh_stock_logo_sources.py)이 종목마다 어느 길로 받을지 미리 판정해 여기 적고,
-- /api/logo 는 이 표를 보고 logo.dev 에 한 번만 묻는다. 방문할 때 하는 일은 그대로다(브라우저 7일 · CDN 하루 캐시).
-- 그림은 저장하지 않는다 — logo.dev 무료 약관에서 영구 보관은 유료 조건이다. 여기엔 '어디서'만 적는다.
--
-- ## 칸
--
--   code        종목코드(stocks.code)
--   market      KOSPI · KOSDAQ
--   source      ticker(티커로 나온다) · domain(도메인으로 나온다) · none(둘 다 없거나 걸렀다 — 묻지 않고 배지)
--   domain      KIND 홈페이지에서 뽑은 도메인(www 뗌). source = domain 일 때 /api/logo 가 쓴다
--   digest      받은 그림(64px png)의 sha256. 여러 회사에 같은 그림이 나오면 기본 아이콘(워드프레스 등)이라 거른다
--   checked_at  마지막으로 logo.dev 에 물어본 때. 오래된 것부터 다시 묻는다
--   note        거른 이유(기본 아이콘 · 손으로 뺀 것)
--
-- ⚠️ 이 표가 없거나 종목 행이 없으면 /api/logo 는 예전처럼 티커로 묻는다. 그래서 코드와 이 마이그레이션의 순서는
--    상관없지만, 먼저 실행해 둘 것.
--
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.stock_logo_source (
  code text primary key,
  market text not null,
  source text not null check (source in ('ticker', 'domain', 'none')),
  domain text,
  digest text,
  checked_at timestamptz not null default now(),
  note text,
  check (source <> 'domain' or domain is not null)
);

comment on table public.stock_logo_source is
  '국장 종목 로고를 logo.dev 에 어떤 길로 물을지. scripts/refresh_stock_logo_sources.py 가 적고 app/api/logo 가 읽는다. 그림은 저장하지 않는다';
comment on column public.stock_logo_source.source is
  'ticker · domain · none. none 이면 /api/logo 가 logo.dev 에 묻지 않고 바로 배지로 보낸다';
comment on column public.stock_logo_source.digest is
  '받은 그림(64px png)의 sha256 — 여러 회사에 같은 그림이면 기본 아이콘으로 보고 none 으로 돌린다';

alter table public.stock_logo_source enable row level security;
-- 공개 read 정책 없음(의도적). service_role 키만 접근 — 옆 표들과 같다.
