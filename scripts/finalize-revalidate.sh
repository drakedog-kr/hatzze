#!/usr/bin/env bash
#
# 파이프라인 마지막 화면 비우기(daily-update.yml finalize 잡 · 2026-10-18). 이 실행에서 **먼저 바뀐 화면은 빼고** 나머지를 비운다.
#
# 화면 첫 줄 '업데이트' 라벨은 그 화면이 새로 그려진 시각이다(lib/refreshed-at.ts). 먼저 바뀐 화면을 여기서 또 비우면 내용은
# 그대로인데 라벨만 늦은 시각으로 바뀐다. 그래서 앞 자리 비우기가 **성공한** 화면만 뺀다 — 실패했거나 안 돌았으면 여기서 비운다.
#
# 받는 값(앞 스텝의 outcome — success 일 때만 뺀다. 비었으면 안 돈 것이다):
#   SLOT              morning 이면 아침, 나머지는 저녁
#   RV_PREVIEW_AM     아침 06:31 미리보기(kr_preview 잡)
#   RV_MORNING_GROUP  아침 한 묶음 — 홈 · 국장/미장 카더라 · 테마 목록/상세(update 잡 끝)
#   RV_HOME RV_KADERA RV_KADERA_US RV_THEME RV_PREVIEW_PM
#                     저녁 화면별 비우기(update 잡)
# 배당 · 종목 · ETF · 데일리 노트 · 내부자 같은 나머지는 늘 여기서 비운다.
#
# 빼는 단위는 최상위 자리다(lib/revalidate-paths.ts TOP_SEGMENTS). /kadera 자리는 국장 · 미장 두 화면이라, 하나만 먼저
# 바뀌었으면 자리를 빼고 남은 하나를 따로 비운다.
# DRY_RUN=1 이면 부를 명령만 찍는다(tests/finalize-revalidate.test.ts).
set -uo pipefail

ok() { [ "${!1:-}" = success ]; }

except=(); extra=()
if [ "${SLOT:-}" = morning ]; then
  ok RV_PREVIEW_AM && except+=(/preview)
  ok RV_MORNING_GROUP && except+=(/ /kadera /theme)
else
  ok RV_HOME && except+=(/)
  ok RV_PREVIEW_PM && except+=(/preview)
  ok RV_THEME && except+=(/theme)
  if ok RV_KADERA || ok RV_KADERA_US; then
    except+=(/kadera)
    ok RV_KADERA || extra+=(/kadera)
    ok RV_KADERA_US || extra+=(/kadera/us)
  fi
fi

run() {
  if [ -n "${DRY_RUN:-}" ]; then echo "revalidate.sh $*"; return 0; fi
  REVALIDATE_STRICT=1 bash "$(dirname "$0")/revalidate.sh" "$@"
}

status=0
if [ "${#except[@]}" -gt 0 ]; then
  echo "이 실행에서 먼저 바뀐 자리: ${except[*]} — 빼고 비웁니다"
  run --all-except "${except[@]}" || status=1
else
  run || status=1
fi
if [ "${#extra[@]}" -gt 0 ]; then
  run "${extra[@]}" || status=1
fi
exit "$status"
