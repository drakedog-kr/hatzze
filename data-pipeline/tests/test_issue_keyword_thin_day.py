"""calculate_telegram_sentiment.issue_keyword_rows — 표본이 거의 없는 마지막 날(기준일 아침)은 창에서 뺀다(common/thin_days.py).

2026-10-04 일요일 아침 화제어가 33건뿐인 날이 사흘 평균의 1/3 을 차지해 증감이 흔들렸다. 화면 computeIssueKeywords 와 같은 규칙.
"""
from datetime import datetime, timedelta, timezone

import calculate_telegram_sentiment as S


def _day(n: int) -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=n)).isoformat()


def test_thin_last_day_left_out():
    rows = []
    for n in range(9, 0, -1):  # 9일 전 ~ 어제: 평범한 날
        rows += [{"date": _day(n), "keyword": "HBM", "mention_count": 100}, {"date": _day(n), "keyword": "금리", "mention_count": 900}]
    rows.append({"date": _day(0), "keyword": "금리", "mention_count": 5})  # 오늘 아침: 5건뿐
    out = S.issue_keyword_rows(rows)
    assert out[0]["computed_for"] == _day(1)
    by = {r["keyword"]: r for r in out}
    # 얇은 날이 들어가면 HBM 의 최근 몫이 (10+10+0)/3 로 떨어져 '줄어듦'이 됐다.
    assert by["HBM"]["trend"] == "flat"
    assert by["금리"]["mention_count"] == 2700
