-- 065 · 분류 행에 본문 해시를 둔다 — 센티먼트 집계가 복붙 글을 한 건으로 세기 위해.
--
-- 왜: 같은 글이 여러 채널에 포워드되면 지금은 그 수만큼 톤이 세어진다. 최근 7일 실측으로
-- 분류 글의 28%가 같은 본문이었고, 그 복붙 글의 낙관도는 74% 로 원글(62%)보다 훨씬
-- 높았다. 홍보성 글이 많이 퍼지기 때문이다. 하루에 같은 본문은 한 번만 세려면 집계
-- 단계에서 "같은 글"을 알아야 하는데, 집계기는 본문을 안 읽는다(4만 행 본문을 실어
-- 나르다 statement timeout 으로 두 번 죽은 자리). 그래서 **분류할 때 본문이 손에 있는
-- 순간** 해시를 한 칸 남겨 두고, 집계는 그 칸만 본다.
--
-- 값은 analyze_telegram_messages.body_key 와 같다(앞 600자 · 링크를 'U' 로 · 공백 제거 ·
-- sha1). 이미 그 함수가 비용 절감용 중복 판정에 쓰는 키라, 저장만 새로 한다.
--
-- ⚠️ 이전 행은 null 이다. scripts/backfill_analysis_text_hash.py 가 한 번 채운다.
--    null 인 행은 집계에서 중복 판정 없이 그대로 센다(빠지지 않는다).
alter table public.telegram_message_analysis
  add column if not exists text_hash text;

comment on column public.telegram_message_analysis.text_hash is
  '본문 해시(analyze_telegram_messages.body_key). 센티먼트 집계가 같은 날 같은 본문을 한 건으로 세는 데 쓴다. null 이면 중복 판정 없이 센다';
