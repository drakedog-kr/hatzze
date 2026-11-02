"""scripts/scan_us_stock_candidates.py — SEC 상장 목록에서 거래소가 빈 줄을 버린다(2026-11-02 이슈 #799)."""
import scan_us_stock_candidates as scan

RAW = {
    "fields": ["cik", "name", "ticker", "exchange"],
    "data": [
        [1792789, "DoorDash, Inc.", "DASH", "Nasdaq"],
        [2130357, "Anthropic, PBC", "ANT", None],
        [1629210, "Paramount Gold Nevada Corp.", "pzg", "NYSE"],
        [2041610, "Skydance Corp", "SKYD", "NYSE"],
        [2041610, "Skydance Corp", "SKYD", "OTC"],
        [9, "빈 티커", None, "NYSE"],
    ],
}


def test_unlisted_row_is_dropped():
    # 앤트로픽은 상장 신고만 했고 거래소가 없다 — 소득 1,685건으로 올라왔지만 시세가 없다
    assert "ANT" not in scan.listed_master(RAW)


def test_listed_rows_keep_name_and_exchange():
    out = scan.listed_master(RAW)
    assert out["DASH"] == ("DoorDash, Inc.", "Nasdaq")
    assert out["PZG"] == ("Paramount Gold Nevada Corp.", "NYSE")  # 티커는 대문자로


def test_first_row_wins_and_empty_ticker_is_skipped():
    out = scan.listed_master(RAW)
    assert out["SKYD"][1] == "NYSE"
    assert set(out) == {"DASH", "PZG", "SKYD"}
