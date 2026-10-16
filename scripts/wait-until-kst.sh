#!/usr/bin/env bash
#
# 오늘 KST HH:MM 까지 잔다. 이미 지났으면 바로 끝난다.
#   bash scripts/wait-until-kst.sh 07:00
#
# daily-update.yml 의 'KRX 공표(08:00 KST) 대기' 스텝들과 같은 셈이다 — 날짜를 명시해 넣어 러너(GNU date)와
# 손으로 돌리는 맥(BSD date)의 파싱이 갈리지 않게 한다.
set -uo pipefail

hm="${1:?HH:MM}"
today=$(TZ=Asia/Seoul date +%Y-%m-%d)
target=$(TZ=Asia/Seoul date -d "$today $hm" +%s 2>/dev/null || TZ=Asia/Seoul date -j -f '%Y-%m-%d %H:%M' "$today $hm" +%s)
now=$(date +%s)
wait=$(( target - now ))
if [ "$wait" -gt 0 ]; then
  echo "$hm KST 까지 $((wait / 60))분 대기합니다 (현재 $(TZ=Asia/Seoul date '+%H:%M') KST)"
  sleep "$wait"
else
  echo "이미 $hm KST 를 지났습니다 (현재 $(TZ=Asia/Seoul date '+%H:%M') KST) — 대기 없음"
fi
