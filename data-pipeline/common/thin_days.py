"""표본이 거의 없는 날 — 창을 고를 때 뺀다.

**lib/theme-flow.ts 의 thinDays · usableDays 를 옮긴 것이다.** Python 과 TS 라 import 로 공유할 수 없어 손으로 맞춘
사본이고, 문턱 · 규칙을 바꾸면 양쪽을 같이 고친다. 화면(테마 로테이션 · 테마 상세 · 이슈 키워드)과 그 옆 문장
(방송 테마 순위 · 미장 총평 · 테마 요약)이 같은 사흘을 말해야 한다.

왜 빼나: '최근 3일'은 날마다의 몫을 같은 무게로 평균한다. 2026-10-04 일요일 아침 국장 테마 언급이 4건(전부 반도체)뿐인
날이 그대로 들어가 그날 100% 가 사흘 평균의 1/3 을 차지했고, 반도체가 66.7%(언급으로 재면 38%)로 부풀었다.
주말 하루(평소의 7% 이상)는 남는다 — '오늘 뜬 테마는 오늘 보여야 한다'(2026-09-29)는 그대로다.
"""

from __future__ import annotations

from statistics import median

# 하루 총량이 평소(총량이 있는 날의 중앙값)의 이 비율 미만이면 얇은 날이다. lib/theme-flow.ts THIN_DAY_FRAC 와 같은 값.
THIN_DAY_FRAC = 0.05


def thin_days(day_totals: dict[str, float] | None, days: list[str]) -> set[str]:
    """days 가운데 총량이 평소의 THIN_DAY_FRAC 미만인 날. 총량이 0 인 날(집계 없음)도 든다. 총량을 못 읽었으면 빈 집합."""
    if not day_totals:
        return set()
    vals = [day_totals.get(d, 0) for d in days if day_totals.get(d, 0) > 0]
    if not vals:
        return set()
    mid = median(vals)
    return {d for d in days if day_totals.get(d, 0) < mid * THIN_DAY_FRAC}


def usable_days(day_totals: dict[str, float] | None, days: list[str]) -> list[str]:
    """얇은 날을 뺀 날짜(받은 차례 그대로)."""
    thin = thin_days(day_totals, days)
    return [d for d in days if d not in thin]
