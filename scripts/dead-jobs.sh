#!/usr/bin/env bash
#
# 같은 실행에서 알림 없이 죽은 잡을 찾는다(2026-11-03 #301).
#   bash scripts/dead-jobs.sh                  # 이 실행(GITHUB_RUN_ID)
#   JOBS_JSON=파일 bash scripts/dead-jobs.sh    # 테스트 · 지난 실행 점검(…/runs/<id>/jobs 응답 그대로)
# 죽은 잡마다 "잡 · 결론 · 멈춘 스텝" 한 줄을 찍는다. 없으면 아무것도 안 찍고 0 으로 끝난다.
# 잡 목록을 못 읽으면 2 로 끝난다(부르는 쪽이 '못 봤다'를 알린다).
#
# 잡마다 알림 스텝은 그 잡 **안에** 있다. 그래서 두 경우엔 알림이 같이 사라진다.
#   ① 러너가 끊긴 잡 — #301 배당 잡("The hosted runner lost communication with the server"). 돌던 스텝은 in_progress,
#      뒤 스텝은 pending 인 채 잡이 failure 로 닫힌다. 알림 스텝이 아예 안 돈다.
#   ② 시간 상한(timeout-minutes)에 걸린 잡 — 잡이 취소로 끝나 알림 스텝의 `!cancelled()` 가 거짓이 된다.
#      돌던 스텝의 결론이 cancelled 로 남는다.
# ⭐ 알림 스텝이 일부러 `exit 1` 한 잡(급부상 유령 의심 · 국장 집계 · Summarize results …)은 스텝이 다 끝나 있고
#    취소된 스텝도 없어서 안 걸린다. 그 잡은 이미 제 이슈를 열었다 — 여기서 또 열면 같은 일을 두 번 알린다.
# ⭐ 아직 안 끝난 잡(이 스텝을 부른 잡 자신 등)과 건너뛴 잡은 안 본다.
set -uo pipefail

if [ -n "${JOBS_JSON:-}" ]; then
  jobs=$(cat "$JOBS_JSON") || exit 2
else
  # filter=latest — 실패한 잡만 다시 돌린 실행에서는 다시 돈 쪽을 본다(scripts/wait-for-job-step.sh 와 같은 주소).
  jobs=$(gh api "/repos/${GITHUB_REPOSITORY:?}/actions/runs/${GITHUB_RUN_ID:?}/jobs?filter=latest&per_page=100") || exit 2
fi

printf '%s' "$jobs" | jq -r '
  .jobs[]
  | select(.status == "completed")
  | select(.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out")
  | . as $j
  | ([.steps[] | select(.status != "completed" or .conclusion == "cancelled")]) as $stuck
  | select($j.conclusion != "failure" or ($stuck | length) > 0)
  | "\($j.name) · \($j.conclusion) · \(($stuck[0].name) // "멈춘 스텝 없음")"
' || exit 2
