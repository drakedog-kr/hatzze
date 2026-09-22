#!/usr/bin/env bash
#
# 화면 사본(ISR)과 그 아래 fetch 데이터 캐시를 비우고, 비운 곳을 한 번씩 열어 데운다.
# 파이프라인(.github/workflows/daily-update.yml)이 여섯 자리에서 부른다 — 화면마다 자료가
# 쓰인 직후에 그 화면만, 그리고 맨 끝에 전부.
#
#   bash scripts/revalidate.sh                    전체 — 루트 레이아웃 아래 전부
#   bash scripts/revalidate.sh /kadera /kadera/us 찍은 경로만
#
# 왜 비우나. 안 부르면 루트 레이아웃의 revalidate(3600초 · 카더라 1800)가 스스로 새로
# 그릴 때까지 최대 한 시간 옛 사본이 나가고, 그 사이 아무도 안 온 화면은 다음 첫
# 방문자가 옛 사본을 받는다(Next 데이터 캐시의 stale-while-revalidate). 2026-09-19 부터
# 시계 주기가 5분→1시간이라 이 호출이 새 자료를 바로 보이게 하는 본선이다.
#
# ⚠️ 비우는 것과 그리는 것은 다르다. 라우트 핸들러에서 부른 revalidatePath 는 '낡음'
#    표시만 하고 **다음 방문 때** 그린다(next 16.2 docs/…/revalidatePath.md 의 Route
#    Handlers 항). 그래서 비운 뒤 여기서 한 번씩 열어 둔다 — 안 그러면 비운 보람이
#    첫 방문자의 대기 시간으로 바뀌고, 그 순간 DB 가 아프면 500 을 본다.
#
# 시크릿이 없으면 아무것도 안 하고 조용히 끝낸다(같은 값을 Vercel 환경변수
# REVALIDATE_SECRET 에도 둔다). 실패해도 0 으로 끝낸다 — 실패의 뜻은 "최대 한 시간
# 늦게 보인다"뿐이라 잡을 붉게 만들 일이 아니다.
set -uo pipefail

BASE="${REVALIDATE_BASE:-https://hatzze.fun}"
# 비운 직후 데울 곳. 인자를 주면 그 경로들만 비우고 그 경로들만 데운다.
# 종목·투자자 상세는 주소가 수백이라 못 데운다 — 처음 여는 사람이 그린다.
DEFAULT_WARM=(/ /kadera /kadera/us /dividend /daily /insider /seohak /preview)

if [ -z "${REVALIDATE_SECRET:-}" ]; then
  echo "REVALIDATE_SECRET 이 없어 건너뜁니다 — 화면은 한 시간 안에 스스로 새로 그립니다(카더라 30분)"
  exit 0
fi

body=""
if [ "$#" -gt 0 ]; then
  warm=("$@")
  # 경로는 이 저장소가 적는 문자열뿐이라 따옴표 섞일 일이 없다. jq 없이 만든다.
  sep=""
  for p in "$@"; do
    body="${body}${sep}\"${p}\""
    sep=","
  done
  body="{\"paths\":[${body}]}"
else
  warm=("${DEFAULT_WARM[@]}")
fi

args=(-sS -o /tmp/revalidate.json -w '%{http_code}' -X POST
      -H "Authorization: Bearer $REVALIDATE_SECRET")
if [ -n "$body" ]; then
  args+=(-H "Content-Type: application/json" -d "$body")
fi

code=$(curl "${args[@]}" "$BASE/api/revalidate" || echo "000")
# 접속 자체가 안 되면(DNS·TCP 실패) curl 이 파일을 안 만든다. 본문은 참고용이니 없어도 지나간다.
cat /tmp/revalidate.json 2>/dev/null || true; echo
if [ "$code" != "200" ]; then
  echo "::warning::화면 사본 비우기가 $code 로 끝났습니다 — 한 시간 안에 스스로 새로 그립니다(카더라 30분)"
  exit 0
fi
echo "화면 사본을 비웠습니다: ${warm[*]}"

# 비운 직후 첫 방문자가 서버 렌더를 기다리지 않도록 여기서 한 번씩 연다. 5xx 면 10초 뒤 두 번 더.
for path in "${warm[@]}"; do
  for attempt in 1 2 3; do
    status=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$path" || echo "000")
    echo "$path → $status (시도 $attempt)"
    [ "$status" -lt 500 ] && break
    sleep 10
  done
done
