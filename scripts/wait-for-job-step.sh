#!/usr/bin/env bash
#
# 같은 실행의 다른 잡(또는 그 잡의 스텝)이 끝날 때까지 기다린다.
#   bash scripts/wait-for-job-step.sh 분 "잡" ["잡::스텝 이름 앞부분"]…
#   예) bash scripts/wait-for-job-step.sh 20 "update::국장 미리보기" insider
#
# daily-update.yml 의 배당 잡이 핀허브를 쓰기 전에 부른다(2026-10-16). 핀허브 무료는 분당 60건이라, 국장 미리보기
# (70종목)·내부자 리포트의 애널리스트 컨센서스와 같은 분에 겹치면 한쪽이 429 로 막힌다. 미리보기는 막히면 그날 카드가
# 반쪽이 된다(fetch_kr_preview.py 머리말).
#
# ⚠️ 못 읽으면(권한 · 깃헙 장애) 시간이 다 될 때까지 기다리다 **그냥 지나간다** — 겹칠 위험만 남고 배당 수집은 돈다.
#    잡에 `actions: read` 권한과 GH_TOKEN 이 있어야 한다.
set -uo pipefail

timeout_min="${1:?분}"; shift
[ $# -gt 0 ] || { echo "기다릴 잡이 없습니다" >&2; exit 2; }
deadline=$(( $(date +%s) + timeout_min * 60 ))
# filter=latest — 잡마다 가장 최근 실행분을 준다. 실패한 잡만 다시 돌린 실행에서도 다시 안 돈 잡(이미 끝난 미리보기 ·
#   내부자)을 끝난 것으로 읽게 하려는 것이다. 시도 번호로 묻는 주소(/attempts/N/jobs)는 그 시도의 잡만 줄 수 있어
#   그 경우 30분을 헛기다린다.
url="/repos/${GITHUB_REPOSITORY:?}/actions/runs/${GITHUB_RUN_ID:?}/jobs?filter=latest&per_page=100"

done_one() {  # "잡" 또는 "잡::스텝 앞부분" 이 끝났나
  local job="${1%%::*}" step=""
  [[ "$1" == *::* ]] && step="${1#*::}"
  if [ -z "$step" ]; then
    gh api "$url" --jq ".jobs[] | select(.name == \"$job\") | .status" 2>/dev/null | grep -qx completed
  else
    gh api "$url" --jq ".jobs[] | select(.name == \"$job\") | .steps[] | select(.name | startswith(\"$step\")) | .status" 2>/dev/null \
      | grep -qx completed
  fi
}

for target in "$@"; do
  until done_one "$target"; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "⚠️ '$target' 가 ${timeout_min}분 안에 끝나지 않았거나 상태를 못 읽었습니다 — 기다리지 않고 지나갑니다"
      exit 0
    fi
    sleep 15
  done
  echo "'$target' 끝남 ($(TZ=Asia/Seoul date '+%H:%M:%S') KST)"
done
