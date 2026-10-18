-- Hatzze — 마이그레이션 104: 국장 종목 로고를 동그라미에 맞게 다듬기(자를 상자 · 우리 그림)
--
-- ## 무엇을 고치나
--
-- 103 으로 로고 길(티커 · 도메인)을 찾아도, 화면에 보이는 국장 종목 260개 중 53개(20%)는 가로로 긴 글자 로고라
-- 22px 동그라미에서 읽히지 않아 머리글자 배지로 떨어졌다(StockLogo unreadableMark · 2026-10-18 실측). 또 23개는
-- logo.dev 에 그림이 아예 없었다.
--
--   crop    긴 글자 로고에서 정사각형으로 잘라 쓸 상자 [x, y, w, h](512px 그림 안 비율, 0~1). 앞쪽 첫 덩어리 —
--           심볼이 있으면 심볼, 없으면 브랜드 서체의 첫 글자. /api/logo 가 sharp 로 잘라 정사각형으로 준다.
--           null = 아직 안 쟀다 · [] = 잴 필요 없거나 못 자른다(그대로 쓴다).
--   image   logo.dev 에 없는 종목의 그림(회사 홈페이지 로고를 다듬은 256px PNG, base64). source = own 일 때 쓴다.
--   image_src  그 그림을 받은 주소(다시 받거나 확인할 때).
--
-- ⚠️ 칸이 없으면(104 전) /api/logo 는 103 처럼 돈다(자르지 않는다 · own 은 없다). 먼저 실행해 둘 것.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.stock_logo_source add column if not exists crop jsonb;
alter table public.stock_logo_source add column if not exists image text;
alter table public.stock_logo_source add column if not exists image_src text;

alter table public.stock_logo_source drop constraint if exists stock_logo_source_source_check;
alter table public.stock_logo_source add constraint stock_logo_source_source_check
  check (source in ('ticker', 'domain', 'none', 'own'));
alter table public.stock_logo_source drop constraint if exists stock_logo_source_own_check;
alter table public.stock_logo_source add constraint stock_logo_source_own_check
  check (source <> 'own' or image is not null);

comment on column public.stock_logo_source.crop is
  '긴 글자 로고에서 잘라 쓸 상자 [x, y, w, h](512px 그림 안 비율). null = 안 쟀다 · [] = 자르지 않는다. /api/logo 가 sharp 로 자른다';
comment on column public.stock_logo_source.image is
  'logo.dev 에 없는 종목의 그림 — 회사 홈페이지 로고를 다듬은 256px PNG(base64). source = own 일 때';
