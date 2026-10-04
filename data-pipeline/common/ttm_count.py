"""지난 1년 배당을 **횟수로** 고른다 — 날짜 창(365일)으로 자르면 끝점에 걸려 한 번씩 빠진다.

2026-10-04 점검: 삼성전자는 9/30 기준일이 지났지만 3분기 금액이 이사회(10월 말) 전이라 없어, 작년 9/30 건은 창 밖으로
빠지고 새 건은 아직 안 들어와 세 분기만 셌다(1,668원 → 1,312원). JEPI 는 2025-10-03 지급분이 하루 차이로 빠지고
2026-10-05 건은 아직 지급 전이라 11달만 셌다. 1년 합 · 수익률 · 달력 · 바스켓 수익률이 다 낮게 나왔다.

그래서 최근 지급 간격(중앙값)으로 한 해 횟수 n 을 셈해(월 12 · 분기 4 · 반기 2 · 연 1) 지난 건 가운데 최근 n 건을 쓴다.
너무 옛날 건이 끌려오지 않게 창은 1년 + 여유(LOOKBACK_SLACK_DAYS)로 막는다.
"""

from __future__ import annotations

from datetime import date, timedelta
from statistics import median

LOOKBACK_SLACK_DAYS = 60


def per_year(dates: list[date]) -> int | None:
    """최근 간격으로 센 한 해 지급 횟수. 지급이 셋 미만이면 None(간격을 못 잰다)."""
    ds = sorted(dates)[-13:]
    if len(ds) < 3:
        return None
    gaps = [(b - a).days for a, b in zip(ds, ds[1:]) if (b - a).days > 0]
    if not gaps:
        return None
    return max(1, min(12, round(365 / median(gaps))))


def last_n_year(items: list[tuple[date, object]], today: date) -> list[object] | None:
    """(날짜, 건) 가운데 오늘까지 것을 날짜순으로, 한 해 횟수만큼 최근 것. 셀 수 없으면 None(호출부가 날짜 창으로 물러선다)."""
    past = sorted((d, x) for d, x in items if d <= today)
    n = per_year([d for d, _ in past])
    if n is None:
        return None
    # 끊은 종목 — 마지막 지급 뒤로 한 주기의 1.5배가 지났으면 지난 1년엔 없다(여유 창이 끊기 전 마지막 건을 끌고 오지 않게).
    if (today - past[-1][0]).days > 365 / n * 1.5:
        return []
    floor = today - timedelta(days=365 + LOOKBACK_SLACK_DAYS)
    chosen = [x for d, x in past if d > floor][-n:]
    return chosen
