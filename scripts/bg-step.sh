#!/usr/bin/env bash
#
# 잡 안에서 스텝 하나를 **뒤에서** 돌리고, 나중 스텝에서 그 결과를 기다린다.
# daily-update.yml 의 update 잡이 미장 카더라 갈래를 국장 갈래와 나란히 돌리는 데 쓴다(2026-10-16).
#
#   bash scripts/bg-step.sh start NAME -- CMD [ARG…]   CMD 를 뒤에서 돌린다. 끝나면 NAME 의 결과가 남는다
#   bash scripts/bg-step.sh run   NAME -- CMD [ARG…]   CMD 를 지금 돌리고 결과를 남긴다(뒤에서 도는 묶음 안에서 쓴다)
#   bash scripts/bg-step.sh skip  NAME [까닭]           NAME 을 '건너뜀'으로 남긴다
#   bash scripts/bg-step.sh own   NAME…                  이 묶음이 NAME… 을 맡는다고 적는다(기다리는 쪽이 생사를 본다)
#   bash scripts/bg-step.sh mark  NAME                   표시 하나를 남긴다(결과 0)
#   bash scripts/bg-step.sh wait  NAME [--quiet] [--soft] [--timeout 분]
#        NAME 의 결과를 기다려 그 종료 코드로 끝난다. 로그를 그대로 찍는다(--quiet 면 안 찍는다).
#        건너뜀이면 0. --soft 면 시간이 다 돼도 0 으로 끝난다(표시를 기다릴 때).
#
# ⭐ 왜 잡을 나누지 않고 이렇게 하나. 미장 스텝들의 `id` 를 그대로 둬야 `if:` 조건과 요약·알림표
#    (`steps.<id>.outcome`)가 손대지 않고 그대로 돈다. 원래 스텝 자리에는 같은 이름 · 같은 `id` 의
#    `wait` 스텝을 두므로 결과(success · failure · skipped)도 예전과 같은 자리에 같은 값으로 남는다.
#    잡을 나누면 그 참조를 전부 잡 출력으로 바꿔야 한다.
# ⚠️ 뒤에서 도는 프로세스는 스텝이 끝나도 살아 있고, 잡이 끝날 때 러너가 정리한다.
# ⚠️ 결과는 파일로만 오간다(BG_DIR). 같은 잡 안에서만 통한다.
set -uo pipefail

BG_DIR="${BG_DIR:-${RUNNER_TEMP:-/tmp}/bg-steps}"
mkdir -p "$BG_DIR"

die() { echo "bg-step: $*" >&2; exit 2; }
alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
# NAME 을 맡은 프로세스 번호. start 로 띄운 것은 NAME.pid, 묶음이 맡은 것은 NAME.owner 에 적힌다.
owner_of() { cat "$BG_DIR/$1.pid" 2>/dev/null || cat "$BG_DIR/$1.owner" 2>/dev/null || true; }
record() {  # NAME RC — 결과를 한 번에 쓴다(기다리는 쪽이 반쯤 쓴 파일을 읽지 않게)
  printf '%s\n' "$2" > "$BG_DIR/$1.rc.tmp" && mv "$BG_DIR/$1.rc.tmp" "$BG_DIR/$1.rc"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  start)
    name="${1:?NAME}"; shift
    [ "${1:-}" = "--" ] && shift
    [ $# -gt 0 ] || die "start $name: 돌릴 명령이 없습니다"
    rm -f "$BG_DIR/$name.rc" "$BG_DIR/$name.log"
    # ⚠️ 바깥 묶음의 표준 입출력도 끊는다. 스텝 셸의 출력 통로를 물고 있으면 러너가 그 통로가
    #    닫힐 때까지 이 스텝을 안 끝낸다 — 뒤에서 돌린 보람이 사라진다.
    (
      "$@" > "$BG_DIR/$name.log" 2>&1
      record "$name" "$?"
    ) < /dev/null > /dev/null 2>&1 &
    echo $! > "$BG_DIR/$name.pid"
    echo "뒤에서 시작: $name (pid $!) — 결과는 '$name' 을 기다리는 스텝이 찍습니다"
    ;;
  run)
    name="${1:?NAME}"; shift
    [ "${1:-}" = "--" ] && shift
    [ $# -gt 0 ] || die "run $name: 돌릴 명령이 없습니다"
    echo "[$(TZ=Asia/Seoul date '+%H:%M:%S')] $name 시작"
    "$@" > "$BG_DIR/$name.log" 2>&1
    rc=$?
    record "$name" "$rc"
    echo "[$(TZ=Asia/Seoul date '+%H:%M:%S')] $name 끝 (종료 코드 $rc)"
    ;;
  skip)
    name="${1:?NAME}"; shift
    printf '건너뜀: %s\n' "${*:-조건이 맞지 않음}" > "$BG_DIR/$name.log"
    record "$name" skip
    echo "[$(TZ=Asia/Seoul date '+%H:%M:%S')] $name 건너뜀"
    ;;
  own)
    # 묶음(start 로 띄운 셸)이 부른다. 그 셸의 번호를 적는다 — $$ 는 잡 스텝 셸이라 쓰면 안 된다.
    me="${BG_OWNER_PID:-$PPID}"
    for name in "$@"; do echo "$me" > "$BG_DIR/$name.owner"; done
    ;;
  mark)
    record "${1:?NAME}" 0
    ;;
  wait)
    name="${1:?NAME}"; shift
    quiet=false; soft=false; timeout_min=150
    while [ $# -gt 0 ]; do
      case "$1" in
        --quiet) quiet=true ;;
        --soft) soft=true ;;
        --timeout) shift; timeout_min="${1:?분}" ;;
        *) die "wait: 모르는 인자 $1" ;;
      esac
      shift
    done
    start_s=$(date +%s)
    deadline=$(( start_s + timeout_min * 60 ))
    waited=false
    while [ ! -f "$BG_DIR/$name.rc" ]; do
      now=$(date +%s)
      owner=$(owner_of "$name")
      # 맡은 프로세스가 결과 없이 사라졌으면 더 기다릴 까닭이 없다(죽었거나 잡이 정리했다).
      # 결과를 쓰는 짧은 틈과 겹칠 수 있어 한 번 더 확인한다.
      if [ -n "$owner" ] && ! alive "$owner"; then
        sleep 1
        [ -f "$BG_DIR/$name.rc" ] && break
        echo "⚠️ $name 을 맡은 프로세스(pid $owner)가 결과 없이 끝났습니다"
        [ -f "$BG_DIR/$name.log" ] && { echo "── $name 로그(끝까지 온 데까지) ──"; cat "$BG_DIR/$name.log"; }
        $soft && exit 0
        exit 1
      fi
      # 아무도 맡지 않았는데 10분이 지나면 시작 스텝이 안 돈 것이다.
      if [ -z "$owner" ] && [ $(( now - start_s )) -ge 600 ] && ! $soft; then
        echo "⚠️ $name 을 맡은 프로세스가 10분 동안 나타나지 않았습니다 — 시작 스텝이 돌았는지 보세요"
        exit 1
      fi
      if [ "$now" -ge "$deadline" ]; then
        echo "⚠️ $name 을 ${timeout_min}분 기다렸지만 결과가 없습니다"
        $soft && exit 0
        exit 1
      fi
      waited=true
      sleep 5
    done
    rc=$(cat "$BG_DIR/$name.rc")
    $waited && echo "$name 결과를 $(( $(date +%s) - start_s ))초 기다렸습니다"
    if ! $quiet && [ -f "$BG_DIR/$name.log" ]; then
      echo "── $name 로그 ──"
      cat "$BG_DIR/$name.log"
      echo "── $name 끝 (종료 코드 $rc) ──"
    fi
    [ "$rc" = skip ] && exit 0
    exit "$rc"
    ;;
  *)
    die "쓰는 법: start|run|skip|own|mark|wait (머리 주석 참고)"
    ;;
esac
