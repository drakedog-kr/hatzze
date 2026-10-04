"""한글 표기가 없는 S&P500 종목의 화면 이름(fetch_us_dividends.short_en) — 법인 꼬리를 뗀 짧은 영문.

'Rollins, Inc.' · 'Progressive Corporation' 이 한글 이름 옆에서 길고 들쭉날쭉했다(2026-10-04 점검).
"""
import fetch_us_dividends as us
from config.us_sp500 import SP500


def test_tails():
    assert us.short_en("Rollins, Inc.") == "Rollins"
    assert us.short_en("Progressive Corporation") == "Progressive"
    assert us.short_en("Coca-Cola Company (The)") == "Coca-Cola"
    assert us.short_en("Lilly (Eli)") == "Eli Lilly"
    assert us.short_en("Alphabet Inc. (Class A)") == "Alphabet (Class A)"
    assert us.short_en("Interactive Brokers Group") == "Interactive Brokers"
    assert us.short_en("Stanley Black & Decker") == "Stanley Black & Decker"
    assert us.short_en("3M") == "3M"


def test_never_empty_and_unique():
    out = {t: us.short_en(n) for t, n in SP500.items()}
    assert all(v.strip() for v in out.values())
    # 다른 회사가 같은 이름이 되지 않는다(클래스 주는 꼬리를 남긴다).
    seen: dict[str, str] = {}
    for t, v in out.items():
        assert v not in seen, f"{t} · {seen.get(v)} → {v}"
        seen[v] = t
