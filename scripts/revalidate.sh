#!/usr/bin/env bash
#
# 화면 사본(ISR)과 그 아래 fetch 데이터 캐시를 비우고, 비운 곳을 한 번씩 열어 데운다.
# 파이프라인(.github/workflows/daily-update.yml)이 일곱 자리에서 부른다 — 화면마다 자료가
# 쓰인 직후에 그 화면만, 그리고 맨 끝에 전부.
#
#   bash scripts/revalidate.sh                    전체 — 루트 레이아웃 아래 전부
#   bash scripts/revalidate.sh /kadera /kadera/us 찍은 경로만
#   bash scripts/revalidate.sh /theme '/theme/[theme]'
#                                                 대괄호가 든 인자는 라우트 패턴이다 — 그 꼴의 화면 전부를 비운다
#                                                 (API 의 routes). ⚠️ 셸이 글롭으로 풀지 않게 따옴표로 감쌀 것.
#                                                 패턴은 데우지 않는다 — 주소가 수십이라 다음 방문자가 그린다.
#   bash scripts/revalidate.sh --all-except /preview
#                                                 찍은 최상위 자리만 빼고 전부(API 의 except · 2026-10-17)
#   REVALIDATE_STRICT=1 bash scripts/revalidate.sh …
#                                                 실패하면 30초 간격으로 두 번 더 해 보고, 그래도 안 되면 1 로 끝낸다
#                                                 (파이프라인 마지막 비우기 — 그 뒤엔 화면을 새로 그릴 길이 없다)
#
# 왜 비우나. 화면의 DB 조회 사본은 라우트마다 따로이고 시간으로 만료되지 않는다(lib/read-cache.ts · 2026-10-17 —
# 파이프라인 도중에 한 페이지 안이 따로따로 바뀌지 않게). 그래서 이 호출이 새 자료를 보이게 하는 유일한 길이다.
# 찍은 경로만 다음 방문 때 DB 를 다시 읽고, 다른 화면은 같은 조회라도 제 사본을 그대로 쓴다.
#
# ⚠️ 비우는 것과 그리는 것은 다르다. 라우트 핸들러에서 부른 revalidatePath 는 '낡음'
#    표시만 하고 **다음 방문 때** 그린다(next 16.2 docs/…/revalidatePath.md 의 Route
#    Handlers 항). 그래서 비운 뒤 여기서 한 번씩 열어 둔다 — 안 그러면 비운 보람이
#    첫 방문자의 대기 시간으로 바뀌고, 그 순간 DB 가 아프면 500 을 본다.
#
# 시크릿이 없으면 아무것도 안 하고 조용히 끝낸다(같은 값을 Vercel 환경변수
# REVALIDATE_SECRET 에도 둔다).
# ⚠️ 2026-10-17 부터 화면의 DB 조회 사본은 시간으로 만료되지 않는다(lib/read-cache.ts — 한 페이지 안이 따로
#    바뀌지 않게). 그래서 여기가 실패하면 그 화면은 **다음 비우기까지** 옛 값이다. 중간 자리는 실패해도 0 으로
#    끝낸다(맨 끝 비우기가 다시 비운다). 맨 끝 비우기는 REVALIDATE_STRICT=1 로 불러 다시 해 보고 실패를 알린다.
set -uo pipefail

BASE="${REVALIDATE_BASE:-https://hatzze.fun}"
# 비운 직후 데울 곳. 인자를 주면 그 경로들만 비우고 그 경로들만 데운다.
# 종목·투자자 상세는 주소가 수백이라 못 데운다 — 처음 여는 사람이 그린다.
#    테마 두 장은 안 연 동안도 그냥 둔다. 404 는 500 이 아니라 한 번에 지나가고, 여는 날 이 목록을 손댈 일이 없다.
DEFAULT_WARM=(/ /etf /kadera /kadera/us /theme /theme/us /dividend /daily /insider /preview)

if [ -z "${REVALIDATE_SECRET:-}" ]; then
  echo "REVALIDATE_SECRET 이 없어 건너뜁니다 — 화면은 다음 비우기까지 옛 값입니다"
  exit 0
fi

body=""; label="${*:-전체}"
if [ "${1:-}" = "--all-except" ]; then
  shift
  label="전체(뺀 자리: $*)"
  [ "$#" -gt 0 ] || { echo "--all-except 뒤에 뺄 자리를 적으십시오" >&2; exit 2; }
  except_json=""; esep=""; warm=()
  for p in "$@"; do except_json="${except_json}${esep}\"${p}\""; esep=","; done
  for w in "${DEFAULT_WARM[@]}"; do
    skip=false; for p in "$@"; do [ "$w" = "$p" ] && skip=true; done
    $skip || warm+=("$w")
  done
  body="{\"except\":[${except_json}]}"
elif [ "$#" -gt 0 ]; then
  warm=()
  # 경로는 이 저장소가 적는 문자열뿐이라 따옴표 섞일 일이 없다. jq 없이 만든다.
  # 대괄호가 든 인자는 라우트 패턴(routes), 나머지는 literal 경로(paths)다. 패턴은 데울 주소가 아니다.
  paths_json=""; routes_json=""; psep=""; rsep=""
  for p in "$@"; do
    case "$p" in
      *"["*) routes_json="${routes_json}${rsep}\"${p}\""; rsep="," ;;
      *)     paths_json="${paths_json}${psep}\"${p}\""; psep=","; warm+=("$p") ;;
    esac
  done
  body="{\"paths\":[${paths_json}],\"routes\":[${routes_json}]}"
else
  warm=("${DEFAULT_WARM[@]}")
fi

args=(-sS -o /tmp/revalidate.json -w '%{http_code}' -X POST
      -H "Authorization: Bearer $REVALIDATE_SECRET")
if [ -n "$body" ]; then
  args+=(-H "Content-Type: application/json" -d "$body")
fi

tries=1; [ -n "${REVALIDATE_STRICT:-}" ] && tries=3
for try in $(seq 1 "$tries"); do
  code=$(curl "${args[@]}" "$BASE/api/revalidate" || echo "000")
  # 접속 자체가 안 되면(DNS·TCP 실패) curl 이 파일을 안 만든다. 본문은 참고용이니 없어도 지나간다.
  cat /tmp/revalidate.json 2>/dev/null || true; echo
  [ "$code" = "200" ] && break
  [ "$try" -lt "$tries" ] && { echo "비우기가 $code — 30초 뒤 다시 합니다($try/$tries)"; sleep 30; }
done
if [ "$code" != "200" ]; then
  echo "::warning::화면 사본 비우기가 $code 로 끝났습니다 — 그 화면은 다음 비우기까지 옛 값입니다"
  [ -n "${REVALIDATE_STRICT:-}" ] && exit 1
  exit 0
fi
echo "화면 사본을 비웠습니다: $label"

# 비운 직후 첫 방문자가 서버 렌더를 기다리지 않도록 여기서 한 번씩 연다. 5xx 면 10초 뒤 두 번 더.
# 패턴만 넘기면 warm 이 비어 있다. `${warm[@]+…}` 는 빈 배열을 set -u 에 걸리지 않게 푼다(macOS 의 bash 3.2).
for path in ${warm[@]+"${warm[@]}"}; do
  for attempt in 1 2 3; do
    status=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$path" || echo "000")
    echo "$path → $status (시도 $attempt)"
    [ "$status" -lt 500 ] && break
    sleep 10
  done
done
