"""지난 1년 배당을 고르는 창 — 365일 날짜 창에 **끝점 여유**를 하나 더한 것.

날짜 창만 쓰면 해마다 같은 날쯤 주는 건이 끝점에 걸려 한 번씩 빠진다 — JEPI(매달 초 지급)는 2025-10-03 지급분이 하루 차이로
창 밖이고 2026-10-05 건은 아직 지급 전이라 11달만 셌다(2026-10-04 점검). 그래서 창 끝 바로 앞(15일) 건은 **최근 15일 안에
지급이 없을 때만** 살린다 — 최근에 지급이 있으면 그 건이 1년 전 같은 차례를 이미 대신한 것이라 둘 다 세면 두 번이다.

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
    recent = any(today - timedelta(days=grace) < d <= today for d, _ in items)
    edge: list[tuple[date, T]] = []
    if not recent:
        cand = [(d, x) for d, x in items if start - timedelta(days=grace) < d <= start]
        if cand and inside:
            edge = cand
        elif cand:
            # 1년 안에 다른 지급이 없으면 — 연 1회 지급(바로 앞 지급이 300일 넘게 떨어짐)일 때만 살린다. 국장 결산배당이 작년보다
            # 며칠 늦게 들어오는 사이 0 이 되지 않게. 분기 · 월 지급인데 1년 안에 없으면 끊은 것이다 — 마지막 건을 살리면 안 된다.
            first = min(d for d, _ in cand)
            before = [d for d, _ in items if d < first]
            if not before or (first - max(before)).days >= ANNUAL_GAP_DAYS:
                edge = cand
    return [x for _, x in sorted(edge + inside, key=lambda t: t[0])]
