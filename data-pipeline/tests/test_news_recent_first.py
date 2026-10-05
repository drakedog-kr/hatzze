"""총평 셋째 대목 발췌 — 최근 날 글부터(generate_telegram_narratives.newest_first). 국장 · 미장 같은 규칙.

휴일 아침엔 기준일 글이 적어 표본을 앞 날까지 넓힌다. 도달 순으로만 세우면 조회가 쌓인 앞 날 글이 앞에 서서
요약이 전날 이야기를 되풀이했다(2026-10-05).
"""
from generate_telegram_narratives import newest_first


def test_newest_day_first_then_score():
    msgs = [
        {"id": "old-big", "day": "2026-10-04", "reach": 90000},
        {"id": "new-small", "day": "2026-10-05", "reach": 800},
        {"id": "new-big", "day": "2026-10-05", "reach": 5000},
        {"id": "older", "day": "2026-10-03", "reach": 120000},
    ]
    out = newest_first(msgs, lambda m: m["day"], lambda m: m["reach"])
    assert [m["id"] for m in out] == ["new-big", "new-small", "old-big", "older"]
