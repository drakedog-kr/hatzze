-- Hatzze — 마이그레이션 005: indicator_values.threshold, indicators.direction 컬럼 추가
-- 지표 상세 카드에 "기준값(예: 5.0% 이상)"을 보여주기 위해 필요한 두 컬럼이다.
-- threshold는 kospi_high_gap(동적 floor)이나 youtube_finance_search_views(누적
-- 평균)처럼 지표에 따라 매일 값이 달라질 수 있어 indicators(정적 메타데이터)가
-- 아니라 indicator_values(일별 값)에 둔다. direction(high/low)은 지표 성격상
-- 거의 바뀌지 않는 값이라 indicators에 둔다.
-- Supabase SQL Editor에서 실행하세요.

alter table public.indicator_values
  add column if not exists threshold numeric;

comment on column public.indicator_values.threshold is '그날 calculate_score.py가 계산한 Hit 기준값. kospi_high_gap/youtube_finance_search_views처럼 기준값이 매일 바뀌는 지표가 있어 indicators가 아니라 여기 저장한다';

alter table public.indicators
  add column if not exists direction text not null default 'high' check (direction in ('high', 'low'));

comment on column public.indicators.direction is 'Hit 판정 방향. high(기본값)=현재값이 기준값 이상이면 Hit, low=현재값이 기준값 이하면 Hit(vkospi, usdkrw_volatility)';

update public.indicators set direction = 'low' where slug in ('vkospi', 'usdkrw_volatility');
