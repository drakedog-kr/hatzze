"""calculate_telegram_trending · calculate_us_trending 의 '오늘' 창 시작점(window_start).

화면 사본(lib/trending-window.ts 의 trendingTodayStartISO)이 tests/trending-window.test.ts 에서
**같은 예제로 같은 값**을 확인한다. 아침 트렌딩 스텝은 'KRX 공표(08:00 KST) 대기' 뒤라 08시대에
도는데, 그때 '어제 0시'를 저장하면 국장 화면은 저장 목록을 버리고 느린 길로 뽑고 미장 화면은
어제 글을 '오늘'로 싣는다.
"""
from datetime import datetime, timedelta

import calculate_telegram_trending as KR
import calculate_us_trending as US
from common.timeutil import KST

TODAY = datetime(2026, 9, 29, tzinfo=KST)
YESTERDAY = datetime(2026, 9, 28, tzinfo=KST)


def _at(hour, minute):
    return datetime(2026, 9, 29, hour, minute, tzinfo=KST)


def test_morning_run_after_krx_gate_stores_today():
    for mod in (KR, US):
        assert mod.window_start(None, _at(8, 0)) == TODAY, mod.__name__
        assert mod.window_start(None, _at(8, 26)) == TODAY, mod.__name__


def test_evening_run_stores_today():
    for mod in (KR, US):
        assert mod.window_start(None, _at(18, 10)) == TODAY, mod.__name__


def test_before_flip_hour_is_yesterday():
    # 손으로 새벽에 돌린 실행 — 화면도 그 시각엔 어제 0시를 기대한다.
    for mod in (KR, US):
        assert mod.window_start(None, _at(0, 31)) == YESTERDAY, mod.__name__
        assert mod.window_start(None, _at(7, 59)) == YESTERDAY, mod.__name__


def test_utc_clock_reads_as_kst():
    # 러너는 UTC 다. 2026-09-28 23:26 UTC 는 09-29 08:26 KST 다.
    now = datetime.fromisoformat("2026-09-28T23:26:00+00:00")
    for mod in (KR, US):
        assert mod.window_start(None, now) == TODAY, mod.__name__


def test_rolling_windows_count_back_from_now():
    now = _at(18, 10)
    for mod in (KR, US):
        assert mod.window_start(7, now) == now - timedelta(days=7), mod.__name__


def test_kr_and_us_flip_at_same_hour():
    assert KR.FIRST_COLLECTION_HOUR_KST == US.FIRST_COLLECTION_HOUR_KST
