#!/usr/bin/env bash
#
# 미장 카더라 갈래. daily-update.yml 의 update 잡이 국장 갈래와 **나란히** 뒤에서 돌린다(2026-10-16).
#
#   bash scripts/kadera-us-chain.sh extract   미국 종목 추출(실패하면 60초 뒤 한 번 더) — 국장 추출과 같은 때 시작
#   bash scripts/kadera-us-chain.sh rest      나머지 — 국장 추출이 끝난 뒤 시작. 스텝마다 결과를 bg-step 으로 남긴다
#
# 왜 나란히 돌리나. 아침 화면은 KRX 08:00 자료까지 합쳐 **한 번에** 바뀐다(finalize 잡의 전체 비우기). 그 시각은
# 가장 늦게 끝나는 일이 정하는데, 미장 스텝 여덟(20~45분)이 국장 스텝 사이에 한 줄로 끼어 그만큼을 늦췄다.
# 미장 쪽은 국장 결과를 거의 안 읽는다 — 아래 순서 규칙 셋만 지키면 나란히 돌아도 재료가 같다.
#
# ⭐ 순서 규칙(이 줄을 바꾸기 전에 볼 것)
#   ① 미국 종목 일별 집계는 **국장 추출 뒤**다 — 채널 집계의 '국장 대 미장 배분'이 telegram_message_stocks 를 읽고,
#      국장 추출이 그 표를 매 실행 통째로 다시 쓴다. 그래서 rest 는 국장 추출 스텝이 끝난 뒤에 띄운다.
#   ② 동시 언급은 미장 총평보다 **앞**이다 — generate_us_telegram_narratives 가 telegram_us_comention 을 읽는다.
#   ③ 미장 센티먼트는 분류 '수거' 스텝 **뒤**다(API 키 경로에서만 뜻이 있다) — update 잡이 그 스텝 뒤에
#      `analyze_collect` 표시를 남기고, 여기서 그 표시를 기다린다.
#   그리고 거꾸로, update 잡의 국장 스텝이 미장 결과를 읽는 자리(국장 트렌딩의 '미장 글 빼기' · 급부상 한 줄의 미장 센티먼트 ·
#   등락 이유의 미장 일별)는 그 앞에 같은 id 의 기다리기 스텝이 있다.
#
# ⭐ 조건은 워크플로의 `if:` 와 같다. 미장 스텝은 미장 추출이 성공했을 때만, 동시 언급은 두 추출이 다 성공했을 때만
#    돈다(국장 '종목 추출' 스텝 주석 ②). 여기서 건너뛴 스텝은 워크플로의 기다리기 스텝도 같은 `if:` 로 건너뛴다.
# ⚠️ 국장 추출 결과는 환경변수 KR_EXTRACT(success · failure)로 받는다 — 띄우는 스텝이 넣는다.
set -uo pipefail
cd "$(dirname "$0")/.."

BG=(bash scripts/bg-step.sh)

case "${1:-}" in
  extract)
    if python data-pipeline/scripts/extract_telegram_us_stocks.py; then exit 0; fi
    echo "미국 종목 추출이 실패해 60초 뒤 한 번 더 돌립니다(국장 '종목 추출' 주석 ①)"
    sleep 60
    exec python data-pipeline/scripts/extract_telegram_us_stocks.py
    ;;
  rest)
    # 이 묶음이 맡는 스텝들. 기다리는 쪽은 이 셸이 살아 있는지로 '아직 도는 중'과 '죽었다'를 가른다.
    BG_OWNER_PID=$$ "${BG[@]}" own telegram_us_daily telegram_us_trending telegram_us_theme \
      telegram_us_comention telegram_us_sentiment telegram_us_narratives telegram_us_theme_briefs

    "${BG[@]}" wait telegram_us_extract --quiet
    us_rc=$?
    us=false; [ "$us_rc" -eq 0 ] && us=true
    kr=false; [ "${KR_EXTRACT:-}" = success ] && kr=true
    both=false; $us && $kr && both=true
    echo "미국 추출 성공=$us · 국장 추출 성공=$kr"

    step() {  # NAME 조건 -- 명령…
      local name="$1" ok="$2"; shift 2
      [ "${1:-}" = "--" ] && shift
      if $ok; then "${BG[@]}" run "$name" -- "$@"; else "${BG[@]}" skip "$name" "추출이 실패해 건너뜀"; fi
    }

    step telegram_us_daily "$us" -- python data-pipeline/scripts/calculate_us_stock_daily.py
    # 트렌딩 '오늘' 창이 오늘 0시로 넘어간 뒤에 저장한다(lib/trending-window.ts FIRST_COLLECTION_HOUR_KST).
    bash scripts/wait-until-kst.sh 07:00
    step telegram_us_trending "$us" -- python data-pipeline/scripts/calculate_us_trending.py
    step telegram_us_theme "$us" -- python data-pipeline/scripts/calculate_us_theme_daily.py
    step telegram_us_comention "$both" -- python data-pipeline/scripts/calculate_us_comention.py
    # 규칙 ③ — 표시가 안 오면(수거 스텝이 안 돌았으면) 90분 뒤 그냥 간다. 구독 경로에선 수거할 것이 없다.
    "${BG[@]}" wait analyze_collect --quiet --soft --timeout 90
    step telegram_us_sentiment "$us" -- python data-pipeline/scripts/calculate_us_telegram_sentiment.py
    step telegram_us_narratives "$us" -- python data-pipeline/scripts/generate_us_telegram_narratives.py
    step telegram_us_theme_briefs "$us" -- python data-pipeline/scripts/generate_us_theme_briefs.py
    ;;
  *)
    echo "쓰는 법: bash scripts/kadera-us-chain.sh extract|rest" >&2
    exit 2
    ;;
esac
