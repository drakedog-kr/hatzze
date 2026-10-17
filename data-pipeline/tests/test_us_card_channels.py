"""generate_surging_oneliners.us_card_channels — 저녁 창 미장 카드 종목의 관심의 폭(2026-10-18 머지 전 점검)."""
import generate_surging_oneliners as G


def _m(day, ch, *tickers, method="name"):
    return {"date": day, "channel_handle": ch, "mentions": [{"ticker": t, "method": method} for t in tickers]}


def test_counts_distinct_channels_in_card_window():
    msgs = [
        _m("2026-10-16", "a", "CRWV"),
        _m("2026-10-17", "a", "CRWV"),  # 같은 채널은 한 번
        _m("2026-10-18", "b", "CRWV", "NVDA"),
        _m("2026-10-15", "c", "CRWV"),  # 창(10-16~10-18) 밖
        _m("2026-10-18", "d", "TSLA"),  # 카드 종목이 아님
    ]
    assert G.us_card_channels(msgs, ["CRWV", "NVDA"], "2026-10-16", "2026-10-18") == {"CRWV": 2, "NVDA": 1}


def test_skips_house_rows_and_absent_tickers():
    msgs = [_m("2026-10-18", "a", "GS", method="house"), _m("2026-10-18", "b", "GS")]
    assert G.us_card_channels(msgs, ["GS", "MS"], "2026-10-16", "2026-10-18") == {"GS": 1}


def test_window_before_loaded_messages_is_unknown():
    # 받은 글이 창 시작보다 늦게 시작하면 못 센다 — 덜 센 값을 적지 않는다.
    assert G.us_card_channels([], ["CRWV"], "2026-10-17", "2026-10-18") is None
