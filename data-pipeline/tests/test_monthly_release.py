"""월간 공표 지표(CCSI · 기업 체감 경기)를 공표일부터 쓰는지 — common/indicator 의 usable_from · published_dates.

행 날짜(그달 1일)는 공표보다 3주쯤 이르다. 지난 날짜로 다시 잴 때 행 날짜부터 쓰면 미래를 본다(2026-10-16 전수 검사 4).

지키는 것:
- 공표일을 모르는 행: 기업 체감 경기는 조사한 달 25일, CCSI 는 다음 달 1일(해를 넘긴다).
- 수집기는 처음 본 날을 적는다. 이미 저장된 행은 적힌 값을 안 바꾸고, 기록이 비었으면 오늘을 적지 않는다.
- 재계산(recompute_score_history.latest)은 공표일 전엔 앞 달 행을 쓴다. 다른 지표는 행 날짜 그대로다.
"""
from common.indicator import publish_fallback, published_dates, usable_from
import recompute_score_history as R

BSI, CCSI = "business_outlook", "consumer_sentiment_index"


def test_fallback_dates():
    assert publish_fallback(BSI, "2026-09-01") == "2026-09-25"
    assert publish_fallback(CCSI, "2026-09-01") == "2026-10-01"
    assert publish_fallback(CCSI, "2025-12-01") == "2026-01-01"


def test_usable_from_prefers_stored_published():
    assert usable_from(BSI, {"date": "2026-09-01", "details": {"published": "2026-09-24"}}) == "2026-09-24"
    assert usable_from(BSI, {"date": "2026-09-01", "details": None}) == "2026-09-25"
    assert usable_from(CCSI, {"date": "2026-09-01"}) == "2026-10-01"
    # 월간 공표 지표가 아니면 행 날짜 그대로
    assert usable_from("kospi_high_gap", {"date": "2026-09-01", "details": {"published": "2099-01-01"}}) == "2026-09-01"


def test_published_dates_first_seen():
    stored = {"2026-08-01": {"published": "2026-08-26"}, "2026-09-01": {"bsi": 77.0}}
    got = published_dates(BSI, stored, ["2026-08-01", "2026-09-01", "2026-10-01"], "2026-10-27")
    assert got == {
        "2026-08-01": "2026-08-26",  # 적힌 값은 그대로
        "2026-09-01": "2026-09-25",  # published 없이 저장된 옛 행은 추정
        "2026-10-01": "2026-10-27",  # 오늘 처음 나온 달
    }


def test_published_dates_empty_history_is_not_today():
    # 처음 채우는 날 285개월이 전부 '오늘 공표'가 되면 지난 기록이 통째로 안 쓰인다
    got = published_dates(CCSI, {}, ["2026-08-01", "2026-09-01"], "2026-10-16")
    assert got == {"2026-08-01": "2026-09-01", "2026-09-01": "2026-10-01"}


def test_recompute_latest_waits_for_release():
    rows = [
        {"date": "2026-08-01", "raw_value": 8.0, "details": {}},
        {"date": "2026-09-01", "raw_value": 10.0, "details": {"published": "2026-09-23"}},
    ]
    assert R.latest(rows, "2026-09-22", BSI)["raw_value"] == 8.0
    assert R.latest(rows, "2026-09-23", BSI)["raw_value"] == 10.0
    # 행 날짜 규칙이던 다른 지표는 그대로
    assert R.latest(rows, "2026-09-01", "kospi_high_gap")["raw_value"] == 10.0
    assert R.latest(rows, "2026-07-31", BSI) is None
