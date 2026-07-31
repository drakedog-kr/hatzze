-- Hatzze — 마이그레이션 024: daily_score.prev_score 컬럼 추가
-- 탑바 티커의 "▲3"(온도 등락)을 '직전 파이프라인 실행' 기준으로 그리기 위한 칸이다.
-- 파이프라인은 하루 두 번(오전·오후) 도는데 두 실행이 같은 날짜 행을 덮어쓴다. 그래서
-- 프론트가 앞 '날짜' 행과 비교하면, 오후 실행이 새 점수를 써도 화살표는 계속 어제와의
-- 차이를 가리켜 방금 바뀐 온도가 화면에 나타나지 않았다.
-- calculate_score.py가 덮어쓰기 직전에 저장돼 있던 점수를 매 실행 여기에 적는다.
-- 값이 없으면(마이그레이션 전이거나 기록이 하나뿐) 프론트는 앞 행 점수로 폴백하므로
-- 화살표가 사라지지는 않는다.
-- Supabase SQL Editor에서 실행하세요.

alter table public.daily_score
  add column if not exists prev_score numeric;

comment on column public.daily_score.prev_score is '이 행을 쓰기 직전에 저장돼 있던 score(=직전 파이프라인 실행의 점수). 탑바 티커의 온도 등락 화살표가 이 값과의 차이를 그린다. calculate_score.py가 매 실행 채우며, null이면 프론트가 앞 날짜 행의 score로 폴백한다';
