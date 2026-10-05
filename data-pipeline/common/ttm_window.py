"""지난 1년 배당을 고르는 창 — 365일 날짜 창에 **끝점 여유**를 하나 더한 것.

날짜 창만 쓰면 해마다 같은 날쯤 주는 건이 끝점에 걸려 한 번씩 빠진다 — JEPI(매달 초 지급)는 2025-10-03 지급분이 하루 차이로
창 밖이고 2026-10-05 건은 아직 지급 전이라 11달만 셌다(2026-10-04 점검). 그래서 창 끝 바로 앞(15일) 건은 **그 건의 1년 뒤
짝이 아직 안 들어왔을 때만** 살린다 — 들어왔으면 그 짝이 이미 창 안에 있어 둘 다 세면 두 번이다.

국장(calculate_kr_dividend_stats)은 이 창을 쓰지 않는다 — 기준일 창에 '금액 미정 행 채우기'만 더했다(그 파일 주석).

⛔ 한때 '최근 간격으로 센 한 해 횟수만큼 최근 건'(횟수 셈)으로 바꿨다가 되돌렸다(같은 날, 머지 전 점검). 주간 ETF 가 12건으로 잘려
1년 합이 1/4 이 됐고(ULTY 23.98 → 3.72), 최근 분기배당을 시작한 회사는 옛 연 1회 간격 때문에 한 건만 셌으며(LG 3,100 → 1,000원),
'끊은 종목' 판정이 6개월 전에 배당한 종목을 0 으로 만들었다(대교 · 웅진씽크빅 등 11종목). 날짜 창은 그런 일이 없다.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import TypeVar

T = TypeVar("T")

DAYS = 365
EDGE_GRACE_DAYS = 15  # 월분배 주기의 절반 — 이보다 넓으면 월분배가 두 번 세질 수 있다
ANNUAL_GAP_DAYS = 300  # 이만큼 떨어져 있으면 연 1회 지급으로 본다


def ttm_window(items: list[tuple[date, T]], today: date, days: int = DAYS, grace: int = EDGE_GRACE_DAYS) -> list[T]:
    """(날짜, 건) 가운데 지난 1년(오늘 포함, days 일 전 날 제외) 것을 날짜순으로. 끝점 여유는 머리말.

    ⚠️ 정렬은 날짜로만 한다 — 같은 날 두 건(정기 + 보충배당)이면 (날짜, dict) 튜플 비교가 dict 끼리 견주다 TypeError 로 죽는다.
    """
    start = today - timedelta(days=days)
    inside = [(d, x) for d, x in items if start < d <= today]
    edge: list[tuple[date, T]] = []
    for d, x in items:
        if not (start - timedelta(days=grace) < d <= start):
            continue
        # 이 건의 1년 뒤 짝이 이미 들어왔으면(이 건 + 1년 − 여유 뒤에 지급이 있으면) 빼야 두 번이 아니다. 오늘 기준 '최근 15일'로
        # 보면 올해 지급이 작년보다 하루라도 이르면 작년 건과 올해 건이 함께 들었다(JEPI · SCHD · KO · T, 같은 날 머지 전 반박 검증).
        if any(d + timedelta(days=days - grace) < e <= today for e, _ in items):
            continue
        if not inside:
            # 1년 안에 다른 지급이 없으면 — 연 1회 지급(바로 앞 지급이 300일 넘게 떨어짐)일 때만 살린다. 분기 · 월 지급인데 1년 안에
            # 없으면 끊은 것이다 — 마지막 건을 살리면 안 된다.
            before = [e for e, _ in items if e < d]
            if before and (d - max(before)).days < ANNUAL_GAP_DAYS:
                continue
        edge.append((d, x))
    return [x for _, x in sorted(edge + inside, key=lambda t: t[0])]
