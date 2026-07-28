"""카더라 수집 커버리지가 며칠째 낮으면 실패로 끝낸다(부분 수집 감시).

**왜 필요한가.** fetch_telegram.py 는 "재료가 아예 안 들어온" 실행만 실패로 끝낸다
(총 0건 → exit 1). 그 문턱을 0으로 잡은 판단은 옳다 — peer 캐시가 차는 중인 날은
대상이 200/317 처럼 부분인 게 정상이라, 하루짜리 비율 문턱을 걸면 멀쩡한 날에도
알림이 울리고 그러면 아무도 안 보게 된다. 문제는 그 문턱 **하나뿐**이라는 것이다.

2026-07-28 저녁 실행이 그랬다. peer 캐시가 200/317 에서 멈췄는데(계정 FloodWait
62,296초) 수집기는 200개에서 31,673건을 걷어 정상 종료했다. 37% 커버리지 손실이
아무 소리 없이 지나갔다. 화면은 "모니터링 채널 317개"라고 말했고, 카더라의 언급
수·채널 수·점유율은 전부 200개 채널만의 것이었다.

**그래서 여기서 재는 것은 '오늘 몇 건'이 아니라 '며칠째 몇 개 채널'이다.** 하루치
비율이 아니라 **연속 일수**를 조건에 넣으면, PR #144 가 지적한 반례(캐시가 차는 중인
정상적인 날)를 피하면서 '오래 낮은' 상태만 잡을 수 있다.

**무엇을 세는가.** telegram_messages 의 updated_at 을 KST 날짜로 묶어 distinct 채널을
센다. 수집기가 매 실행 7일 창을 통째로 다시 upsert 하므로, 그날 손댄 채널은 전부
그날 updated_at 을 단다. peer 캐시 개수(=수집 '대상')를 쓰지 않고 이쪽을 쓰는 이유는,
캐시가 있어도 조회에 실패하는 채널이 있어서다 — 의도가 아니라 결과를 재려는 것이다.

⚠️ 이 눈금의 천장은 100%가 아니다. 7일 창에 글이 한 건도 없는 채널은 upsert 할 행이
없어 안 잡힌다(2026-07-28 기준 317개 중 7개). 그래서 정상인 날도 97~99% 언저리다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/check_telegram_coverage.py
"""

from __future__ import annotations

import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client, load_all  # noqa: E402
from common.timeutil import KST, today_kst  # noqa: E402

# 이 아래로 내려가면 '낮다'고 본다.
#
# 실측(2026-07-19~28, 활성 317개 기준):
#   정상인 날  07-26  315개 = 99.4%
#   고장난 날  07-27   58개 = 18.3%   (FloodWait 로 캐시가 비어 대부분을 건너뜀)
#   부분 수집  07-28  199개 = 62.8%   (캐시 200/317 에서 멈춤)
# 위 천장 주석대로 정상인 날의 상한이 97~99% 라, 80%는 정상에서 15%p 아래이면서
# 부분 수집(63%)에서는 17%p 위다 — 양쪽 어디에서도 가깝지 않다.
#
# 분위수로 고르지 않았다. "평범한 날이면 얼마인가"를 손으로 대입한 값이다. 채널
# 5분의 1이 비공개 전환·핸들 변경으로 영영 빠져도 이 문턱은 안 울린다. 그건 알림이
# 아니라 화면이 맡는다(모니터링 현황 카드의 '수집 중 N개').
COVERAGE_FLOOR = 0.80

# 며칠 연속이어야 알리는가.
#
# 캐시가 **정상적으로** 차는 데 걸리는 기간보다 길어야 한다. sync 는 한 실행에
# 100개까지만 유저네임을 풀고(MAX_RESOLVES_PER_RUN) 워크플로는 하루 두 번 도니,
# 317개면 네 번 = 이틀이면 다 찬다. 그래서 사흘.
STREAK_DAYS = 3

# 목록이 훨씬 커지면 정상 충전도 사흘을 넘긴다(계정의 하루 resolve 예산이 약 200개다).
# 그때는 일수만으로 '차는 중'과 '막힌 것'을 못 가른다 — 대신 창 안에서 **늘고 있는지**를
# 본다. 차오르는 중이면 하루에 100~200개씩 는다(실측: 07-27 58개 → 07-28 199개,
# 이틀에 +141). 막혀 있으면 0 언저리에서 오르내린다.
#
# 50 = 한 실행이 새로 푸는 몫(100개)의 절반. 사흘 동안 그만큼도 못 늘었으면 차오르는
# 중이라고 부를 수 없다.
MIN_PROGRESS_CHANNELS = 50

RECENT_DAYS_SHOWN = 8  # 로그에 찍는 이력 길이(판정 창보다 넉넉히)


def coverage_by_day(db) -> dict[str, set[str]]:
    """KST 날짜 → 그날 수집기가 손댄 채널 핸들 집합.

    표 전체를 읽는다. 같은 표를 통째로 읽는 스텝이 이미 셋 있고(집계·센티먼트 등),
    1,000행 캡과 정렬 키 함정을 load_all 이 한 곳에서 막아 준다 — 여기서만 조건을
    붙이려고 페이징을 새로 쓰면 그 함정이 하나 더 생긴다.
    """
    by_day: dict[str, set[str]] = defaultdict(set)
    for row in load_all(db, "telegram_messages", "channel_handle,updated_at"):
        stamp = row.get("updated_at")
        if not stamp:
            continue
        day = datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone(KST).date()
        by_day[day.isoformat()].add(row["channel_handle"])
    return by_day


def verdict(counts: list[int], active: int) -> tuple[str, str]:
    """판정 창의 일별 수집 채널 수 → (판정, 사람이 읽을 이유).

    판정은 셋이다. "ok"(하루라도 문턱 위) · "filling"(전부 아래지만 차오르는 중) ·
    "stuck"(전부 아래이고 안 늘어남 = 알림).
    """
    ratios = [n / active for n in counts]
    if max(ratios) >= COVERAGE_FLOOR:
        return "ok", f"최근 {len(counts)}일 중 하루라도 {COVERAGE_FLOOR * 100:.0f}% 를 넘겼습니다(최고 {max(ratios) * 100:.1f}%)."
    gain = counts[-1] - counts[0]
    if gain >= MIN_PROGRESS_CHANNELS:
        return "filling", f"낮지만 차오르는 중입니다 — {counts[0]}개 → {counts[-1]}개(+{gain}). 다음 실행이 이어서 채웁니다."
    return "stuck", (
        f"최근 {len(counts)}일 연속으로 수집 채널이 활성 채널의 {COVERAGE_FLOOR * 100:.0f}% 아래입니다"
        f"({' → '.join(f'{n}개' for n in counts)}, 활성 {active}개). 늘어난 채널 {gain:+}개 — "
        f"같은 기간 {MIN_PROGRESS_CHANNELS}개도 못 늘어 캐시가 차는 중이 아닙니다."
    )


def main() -> None:
    db = get_client()

    channels = load_all(db, "telegram_channels", "handle,channel_id,access_hash,is_active")
    active = [c for c in channels if c["is_active"]]
    if not active:
        # 활성 채널이 없는 것은 이 검사가 아니라 fetch_telegram.py 가 잡는다(exit 1).
        # 여기서 0으로 나누지 않도록만 비켜 준다.
        print("[안내] 활성 채널이 0개입니다. 커버리지를 잴 수 없어 건너뜁니다.")
        return
    cached = [c for c in active if c.get("channel_id") and c.get("access_hash")]

    by_day = coverage_by_day(db)
    today = today_kst()
    days = [(today - timedelta(days=i)).isoformat() for i in range(RECENT_DAYS_SHOWN - 1, -1, -1)]

    print(f"[커버리지] 활성 채널 {len(active)}개 · peer 캐시 {len(cached)}개(수집 대상)")
    print(f"{'날짜':12}{'수집 채널':>9}{'커버리지':>9}")
    print("-" * 32)
    for day in days:
        n = len(by_day.get(day, ()))
        mark = "  ← 낮음" if n / len(active) < COVERAGE_FLOOR else ""
        print(f"{day:12}{n:>9}{n / len(active) * 100:>8.1f}%{mark}")

    # 오늘 한 채널도 안 걷혔으면 판정하지 않는다.
    #
    # 이 스크립트는 워크플로에서 수집기 바로 뒤에 붙으므로, 정상 실행에서 오늘 칸이
    # 0인 일은 없다. 0이라면 둘 중 하나다 — 수집이 통째로 실패했거나(그건 fetch 의
    # 0건 문턱이 이미 알린다. 여기서 또 울리면 이슈가 둘로 갈린다), 파이프라인 밖에서
    # 손으로 돌린 것이다(개발 중 실제로 밟았다: KST 자정 직후엔 아직 그날 실행이 없다).
    # 둘 다 이 검사가 할 말이 없는 자리다.
    today_count = len(by_day.get(days[-1], ()))
    if today_count == 0:
        print(
            "\n[커버리지] 오늘 수집 기록이 아직 없어 판정을 건너뜁니다"
            "(수집 실패는 fetch_telegram.py 의 0건 문턱이 맡습니다)."
        )
        return

    # 판정 창 — 오늘 포함 최근 STREAK_DAYS 일. 기록이 없는 날은 0으로 센다(그날 수집이
    # 없었다는 뜻이고, 실제로 그렇다).
    #
    # **오늘을 넣는다.** 이 저장소는 보통 '아직 덜 찬 오늘'을 집계에서 뺀다(화면의
    # kstDateRange 가 그렇다). 여기선 반대로 넣는 편이 맞다. ⑴ 하루 두 번 실행이
    # 누적이라 오늘 칸은 '오늘 지금까지 걷은 채널'로 이미 온전한 뜻이고, ⑵ 무엇보다
    # 채널 목록이 크게 늘어난 날 오늘을 빼면 창이 확장 **전** 날들로만 차서, 옛 12개를
    # 오늘 활성 317개로 나눈 3.8% 세 개가 남아 첫날부터 거짓 알림이 된다. 오늘을 넣으면
    # 그 자리가 '늘고 있음'으로 읽혀(아래 MIN_PROGRESS_CHANNELS) 정상 충전으로 갈린다.
    window = days[-STREAK_DAYS:]
    counts = [len(by_day.get(day, ())) for day in window]
    call, why = verdict(counts, len(active))

    if call != "stuck":
        print(f"\n[커버리지] {'이상 없음 — ' if call == 'ok' else ''}{why}")
        return

    print(f"\n[커버리지] {why}")
    print(
        f"  지금 수집 대상은 peer 캐시가 찬 {len(cached)}/{len(active)}개뿐입니다. "
        "sync_telegram_channels.py 로그의 FloodWait 줄과 telegram_flood_wait 표를 "
        "먼저 보세요 — 만료 뒤 실행이 캐시를 이어서 채우는지가 갈림길입니다."
    )
    print(
        "  ⚠️ MAX_RESOLVES_PER_RUN 을 올리거나 --force-resolve 를 워크플로에 넣지 마세요. "
        "그게 애초에 긴 FloodWait 을 만든 경위입니다(마이그레이션 021·022 주석)."
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
