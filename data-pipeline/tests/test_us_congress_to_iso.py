"""하원 날짜 변환(fetch_us_congress.to_iso) — 0 채우기와 빈 값. 거래일을 비운(None) 행이 스크립트를 죽였다(2026-10-17 · #753)."""
import fetch_us_congress as cg


def test_zero_pads_month_and_day():
    assert cg.to_iso("4/15/2026") == "2026-04-15"
    assert cg.to_iso("10/1/2026") == "2026-10-01"
    assert cg.to_iso("06/11/2026") == "2026-06-11"


def test_empty_or_malformed_is_none():
    # 거래일이 신고일보다 늦은 오기를 main 이 None 으로 비운 뒤 넘긴다 — 예외 없이 None 이어야 한다.
    assert cg.to_iso(None) is None
    assert cg.to_iso("") is None
    assert cg.to_iso("2026-06-11") is None
    assert cg.to_iso("6/11") is None
