#!/usr/bin/env bash
#
# 같은 실행에서 알림 없이 죽은 잡을 찾는다(2026-11-03 #301).
#   bash scripts/dead-jobs.sh                  # 이 실행(GITHUB_RUN_ID)
#   JOBS_JSON=파일 bash scripts/dead-jobs.sh    # 테스트 · 지난 실행 점검(…/runs/<id>/jobs 응답 그대로)
# 죽은 잡마다 "잡 · 결론 · 멈춘 스텝" 한 줄을 찍는다. 없으면 아무것도 안 찍고 0 으로 끝난다.
# 잡 목록을 못 읽으면 2 로 끝난다(부르는 쪽이 '못 봤다'를 알린다).
#
# 잡마다 알림 스텝은 그 잡 **안에** 있다. 그래서 세 경우엔 알림이 같이 사라진다.
#   ① 러너가 끊긴 잡 — #301 배당 잡("The hosted runner lost communication with the server"). 돌던 스텝은 in_progress,
#      뒤 스텝은 pending 인 채 잡이 failure 로 닫힌다. 알림 스텝이 아예 안 돈다.
#   ② 시간 상한(timeout-minutes)에 걸린 잡 — 잡이 취소로 끝나 알림 스텝의 `!cancelled()` 가 거짓이 된다.
#      돌던 스텝의 결론이 cancelled 로 남는다.
#   ③ 알림이 못 본 실패(2026-11-20) — 실행 44700473981 의 kr_preview 잡. 설치 스텝이 러너 종료 신호(exit 143)로
#      failure 로 닫히고, 뒤 스텝은 알림까지 전부 skipped 였다. 스텝이 다 끝나 있어 ①② 로는 안 걸린다.
#      러너가 멀쩡해도 같다 — 미리보기 · 내부자 · 배당 알림은 제 본 스텝의 결과만 보므로 설치가 실패하면 안 돈다.
#      그래서 '실패한 스텝 뒤에 돈 알림 스텝(Alert on …)이 없는' 잡을 고른다. 알림 스텝이 없는 잡(krx_master · logos ·
#      logo_fill)은 본 스텝이 다 continue-on-error 라 실패하면 그 자체가 아무도 안 알린 실패다.
#      실패 스텝도 돈 알림도 없는 failure 잡(나중에 다시 읽은 #301 잡처럼 스텝 목록이 비었다)도 고른다.
# ⭐ 알림 스텝이 일부러 `exit 1` 한 잡(급부상 유령 의심 · 국장 집계 · 배당주 …)은 실패한 스텝이 알림 스텝 자신이라 안 걸린다.
#    Summarize results 가 exit 1 하면 바로 뒤 `if: failure()` 알림이 돈다. 그 잡은 이미 제 이슈를 열었다 — 여기서 또 열면
#    같은 일을 두 번 알린다.
# ⭐ 알림 스텝은 이름('Alert on ' 으로 시작)으로 가린다. 이슈를 여는 스텝은 그렇게 짓는다(tests/dead-jobs.test.ts 가 대조한다).
#    continue-on-error 스텝은 실패해도 깃헙 응답의 결론이 success 라 실패 스텝으로 안 센다.
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
  | ((.steps // []) | to_entries) as $steps
  | ([$steps[].value | select(.status != "completed" or .conclusion == "cancelled")]) as $stuck
  # 마지막으로 돈 알림 스텝의 자리(없으면 -1). 건너뛴 · 취소된 · 안 끝난 알림은 돈 것으로 안 센다.
  | ([$steps[] | select((.value.name | startswith("Alert on ")) and (.value.conclusion == "success" or .value.conclusion == "failure")) | .key]
     | max // -1) as $alerted
  # 그 뒤에 실패한, 알림 스텝이 아닌 스텝 — 이 실패를 알린 스텝이 없다(③).
  | ([$steps[] | select(.key > $alerted and .value.conclusion == "failure" and (.value.name | startswith("Alert on ") | not)) | .value]) as $unalerted
  | select($j.conclusion != "failure" or ($stuck | length) > 0 or ($unalerted | length) > 0 or $alerted < 0)
  | "\($j.name) · \($j.conclusion) · \((($stuck + $unalerted)[0].name) // "멈춘 스텝 없음")"
' || exit 2
