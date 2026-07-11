-- Hatzze — 마이그레이션 006: indicators.headline 컬럼 추가
-- 카드에 표시되는 큰 제목을 감성적인 한 줄 문구(headline)로, 기존 name(지표
-- 정식명)은 그 아래 작은 부제목으로 내리기 위해 필요하다. headline이 비어
-- 있으면 프론트엔드가 name을 큰 제목 자리에 그대로 쓰도록 폴백하므로(마이그레이션
-- 직후 headline이 없는 새 지표가 생겨도 화면이 깨지지 않음), NOT NULL 제약은
-- 걸지 않는다.
-- Supabase SQL Editor에서 실행하세요.

alter table public.indicators
  add column if not exists headline text;

comment on column public.indicators.headline is '카드 상단에 표시되는 감성적인 한 줄 제목. 비어 있으면 name을 대신 큰 제목으로 표시한다';

update public.indicators set headline = '미국이 매기는 이자값' where slug = 'us10y';
update public.indicators set headline = '꼭대기까지 남은 발걸음' where slug = 'kospi_high_gap';
update public.indicators set headline = '경제 몸집을 앞지르는 증시' where slug = 'buffett_index';
update public.indicators set headline = '하루에 오가는 돈의 무게' where slug = 'kospi_volume_surge';
update public.indicators set headline = '시장이 느끼는 불안의 크기' where slug = 'vkospi';
update public.indicators set headline = '금 대신 주식을 택하는 마음' where slug = 'kospi_gold_ratio';
update public.indicators set headline = '환율이 그리는 파동' where slug = 'usdkrw_volatility';
update public.indicators set headline = '몸집 작은 종목들의 기세' where slug = 'kosdaq_kospi_ratio';
update public.indicators set headline = '두 배로 베팅하는 사람들' where slug = 'leverage_etf_volume';
update public.indicators set headline = '이웃 증시들과 나란히 걷는 정도' where slug = 'kospi_asia_relative_strength';
update public.indicators set headline = '처음 계좌를 트는 사람들' where slug = 'naver_search_trend';
update public.indicators set headline = '여론의 온도' where slug = 'dcinside_post_count';
update public.indicators set headline = '신문 헤드라인의 표정' where slug = 'news_sentiment';
update public.indicators set headline = '서점가에 번지는 관심' where slug = 'bestseller_finance_ratio';
update public.indicators set headline = '다들 몰려보는 재테크 영상' where slug = 'youtube_finance_search_views';
update public.indicators set headline = '맑은 하늘이 부추기는 마음' where slug = 'weather_sunshine_index';
update public.indicators set headline = '지갑이 커지는 신호' where slug = 'luxury_consumption_index';
update public.indicators set headline = '오늘 저녁 씀씀이' where slug = 'fine_dining_search_index';
update public.indicators set headline = '화려함 뒤의 이야기' where slug = 'small_business_crisis_index';
update public.indicators set headline = '코인판에서도 뜨거워지는 손' where slug = 'upbit_speculation_index';
