-- Hatzze — 마이그레이션 068: 데일리 노트에 '언급된 종목' 열
--
-- ## 무엇을 담나
--
-- 글 한 편에 이름이 나온 종목. 화면 오른쪽 칸의 '언급된 종목' 카드가 이걸 읽어 국내
-- 종목은 `stocks` 표의 최근 종가·등락률과 함께, 미국 종목은 이름만 보인다(미국 종가는
-- 매일 받는 원천이 없다).
--
--   {"kr": ["000660", "004020"], "us": ["NVDA", "AVGO"]}
--
-- 순서는 **본문에 처음 나온 차례**다. 화면이 그 순서 그대로 그린다.
--
-- ## 왜 올릴 때 뽑아 두나
--
-- 사전(국내 2,700여 종목)을 대고 본문을 훑는 일은 화면이 열릴 때마다 할 일이 아니다.
-- 올리는 스크립트(publish_daily_note.py)가 카더라 종목 추출기(extract_telegram_stocks.py ·
-- extract_telegram_us_stocks.py)와 **같은 사전·같은 경계 규칙**으로 한 번 뽑아 넣는다 —
-- 카더라 화면과 다른 잣대로 세면 같은 글이 다른 종목 목록을 갖게 된다.
--
-- 기본값이 빈 객체라 이전에 올린 줄도 깨지지 않는다(카드가 안 뜰 뿐). 다시 올리면 채워진다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.daily_note
  add column if not exists stocks jsonb not null default '{}'::jsonb;

comment on column public.daily_note.stocks is
  '글에 이름이 나온 종목. {"kr": [종목코드…], "us": [티커…]}, 본문에 처음 나온 차례. publish_daily_note.py 가 카더라 추출기와 같은 사전으로 뽑는다';
