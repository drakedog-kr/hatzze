#!/usr/bin/env bash
#
# 데일리 파이프라인(daily-update.yml)이 아직 화면을 다 비우기 전(finalize 잡이 안 끝남)이면 0(바쁨), 아니면 1.
#   if bash scripts/pipeline-busy.sh; then …비우지 않는다…; fi
#
# 손으로 돌리는 재실행(narratives · surging-oneliners · move-reasons-rerun.yml)과 토요일 미장 이유 생성
# (telegram-broadcast.yml)이 화면을 비우기 전에 부른다. 파이프라인 도중에 페이지를 비우면 그 페이지가 반쯤 바뀐 DB 로
# 그려진다 — 카더라 표는 오늘 것인데 총평은 어제 것인 식으로 한 페이지 안이 따로 바뀐다(2026-10-17). 바쁘면 비우지
# 않는다. 파이프라인의 finalize 가 그 뒤에 재실행 값까지 같이 비운다.
#
# ⚠️ 못 읽으면(권한 · 깃헙 장애) 1(안 바쁨)로 본다 — 재실행 값을 다음 실행까지 숨기는 것보다 낫다.
#    잡에 `actions: read` 권한과 GH_TOKEN 이 있어야 한다.
set -uo pipefail

repo="${GITHUB_REPOSITORY:?}"
ids=$(gh api "/repos/$repo/actions/workflows/daily-update.yml/runs?per_page=10" \
  --jq '.workflow_runs[] | select(.status != "completed") | .id' 2>/dev/null) || { echo "실행 목록을 못 읽어 안 바쁜 것으로 봅니다"; exit 1; }
for id in $ids; do
  # finalize 잡이 아직 목록에 없거나(대기 중인 실행) 안 끝났으면 바쁘다.
  st=$(gh api "/repos/$repo/actions/runs/$id/jobs?filter=latest&per_page=100" \
    --jq '.jobs[] | select(.name == "finalize") | .status' 2>/dev/null) || st=""
  if [ "$st" != "completed" ]; then
    echo "데일리 파이프라인 실행 $id 가 아직 화면을 다 비우기 전입니다 — 여기서는 비우지 않습니다(그 실행의 finalize 가 비운다)"
    exit 0
  fi
done
echo "도는 데일리 파이프라인이 없습니다"
exit 1
