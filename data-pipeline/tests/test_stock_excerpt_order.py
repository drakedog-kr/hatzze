"""종목 흐름 요약 발췌 차례 — 시장 전체 글은 뒤로, 이름이 앞쪽인 글을 먼저(2026-10-15 점검, 국장 · 미장 짝)."""
from datetime import date, timedelta

import generate_telegram_narratives as KR
import generate_us_telegram_narratives as US


def test_order_key_market_then_name_then_spread():
    story = KR.excerpt_order_key(False, "마이크론, 키뱅크가 SSD 가격 인상 전망", "마이크론", 1_000)
    late_name = KR.excerpt_order_key(False, "가" * 300 + " 마이크론", "마이크론", 50_000)
    market = KR.excerpt_order_key(True, "마이크론 국내 증시 하락 배경", "마이크론", 90_000)
    assert sorted([market, late_name, story]) == [story, late_name, market]


def _msg(i: int, d: str, text: str, views: int) -> dict:
    return {"channel_handle": "ch", "message_id": i, "date": d, "text": text, "views": views, "forwards": 0,
            "posted_at": f"{d}T01:00:00+00:00", "mentions": [{"ticker": "MU", "match_text": "마이크론"}]}


def test_us_digest_puts_market_posts_last():
    latest = "2026-10-16"
    d = (date.fromisoformat(latest) - timedelta(days=1)).isoformat()
    market = _msg(1, d, "국내 증시 하락 배경으로 미국 AI 이슈를 따진 글. 마이크론 시간외 약세", 90_000)
    story = _msg(2, d, "마이크론, 키뱅크가 4분기 SSD 가격을 40~45% 올릴 것으로 전망", 3_000)
    other = _msg(3, d, "마이크론 HBM4 공급 계약 소식", 2_000)
    msgs = [market, story, other]
    digests, _ = US.build_stock_digests(latest, msgs, {"MU": "마이크론"}, tickers=["MU"], market_keys={("ch", 1)})
    body = digests[0][2]
    excerpts = [ln for ln in body.splitlines() if ln.startswith("- ")]
    assert "SSD" in excerpts[0] and "국내 증시" in excerpts[-1]
    # 안 주면 예전처럼 조회 순이다.
    digests, _ = US.build_stock_digests(latest, msgs, {"MU": "마이크론"}, tickers=["MU"])
    assert "국내 증시" in [ln for ln in digests[0][2].splitlines() if ln.startswith("- ")][0]
