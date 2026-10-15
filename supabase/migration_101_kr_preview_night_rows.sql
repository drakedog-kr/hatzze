-- Hatzze — 마이그레이션 101: 국장 미리보기의 반도체 · EWY 줄, 다음 개장일, 종목 화면용 짝 목록
--
-- ## 무엇을 고치나
--
-- '밤사이 뉴욕' 이 S&P500 하나로 코스피 개장을 가늠했다. 코스피는 반도체 비중이 커서 S&P 가 올라도
-- 반도체가 빠지면 내려 열리곤 한다. 5년 실측 코스피 개장 갭 상관: S&P500 0.534 · SOXX 0.599 ·
-- EWY 괴리 0.711(backtest/kr_preview_pairs.py night_tables). 그 두 줄의 재료를 담는다.
-- 종목 화면(국장 /stock/[code] · 미장 /insider/stock/[ticker])이 '함께 움직이는' 짝을 그릴 목록도 담는다.
--
-- ## 더하는 칸(kr_preview_day)
--
--   soxx_dp    밤사이 SOXX(반도체 ETF) 등락 %. 연휴 뒤엔 그 세션들의 누적. 지수(^SOX)는 핀허브 무료가
--              403 이라 ETF 다.
--   ewy_ratio  EWY 종가 × 원/달러 종가(15:30) ÷ 코스피 종가 — 셋 다 마지막 국장 개장일 기준.
--              문턱과 상관없이 매일 남긴다. 괴리의 기준(직전 세션 다섯 번의 중앙값)이 이 기록에서 나온다.
--   ewy_prem   그날 비율이 기준에서 몇 % 벗어났나. 국장이 닫힌 뒤 한국 주식 묶음이 미국에서 더 움직인 몫.
--              기록이 다섯 번 쌓이기 전에는 null 이고, 화면은 null 이면 EWY 줄을 안 그린다.
--   next_open  오늘이거나 그 뒤의 첫 국장 개장일. 주말 · 연휴 화면이 "10/19(월) 국장" 처럼 적는다.
--   pairs      깊은 쌍 전부의 그날 값 [{t, us, code, stock, market, why, dp, z, up, open, intra}].
--              문턱(평소 폭 1.0배)을 넘은 쌍에만 open · intra(그날 크기 칸의 5년 평균)가 있다.
--
-- ⚠️ 전부 null 을 허용한다. 이 마이그레이션 전에 쓰인 줄은 비어 있고, 화면은 비어 있으면 그 줄 · 칸 ·
--    모듈을 안 그린다.
-- ⚠️ 수집기는 이 칸들이 없으면 이것만 빼고 다시 쓴다(083~085 칸은 지킨다). 코드보다 먼저 돌려도 해가 없다 —
--    지금 운영 코드는 이 칸을 읽지도 쓰지도 않는다.
-- ⚠️ EWY 기준은 **이 마이그레이션과 새 수집기가 둘 다 들어간 첫 아침부터** 쌓인다. 다섯 번이 차야 EWY 줄이 선다.
--
-- Supabase SQL Editor에서 실행하세요.

alter table public.kr_preview_day add column if not exists soxx_dp numeric;
alter table public.kr_preview_day add column if not exists ewy_ratio numeric;
alter table public.kr_preview_day add column if not exists ewy_prem numeric;
alter table public.kr_preview_day add column if not exists next_open date;
alter table public.kr_preview_day add column if not exists pairs jsonb;

comment on column public.kr_preview_day.soxx_dp is '밤사이 SOXX(반도체 ETF) 등락 %(연휴 뒤엔 누적). 밤사이 뉴욕의 반도체 줄';
comment on column public.kr_preview_day.ewy_ratio is 'EWY 종가 × 원/달러 종가(15:30) ÷ 코스피 종가(마지막 국장 개장일). 괴리 기준을 만드는 기록';
comment on column public.kr_preview_day.ewy_prem is 'EWY 괴리 %: 그날 비율 ÷ 직전 미장 세션 5번 비율의 중앙값 − 1. 기록이 차기 전엔 null';
comment on column public.kr_preview_day.next_open is '오늘이거나 그 뒤의 첫 국장 개장일. 주말 · 연휴 화면의 날짜 표기';
comment on column public.kr_preview_day.pairs is '깊은 쌍 전부의 그날 값 [{t,us,code,stock,market,why,dp,z,up,open,intra}]. 종목 화면의 함께 움직이는 짝';
