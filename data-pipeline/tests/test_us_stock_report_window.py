"""미장 주요 종목 리포트 흐름 요약의 창(generate_us_telegram_narratives.build_stock_digests).

카드(lib/us-telegram-data.ts getUsStockReports)는 기준일을 뺀 앞 3일(loadUsStockDaily 의
windowBefore)의 언급 수로 4장을 고르고 그 사흘을 센다. 요약이 기준일을 넣은 3일로 종목을
고르면 카드에 뜬 종목의 그날 문장이 빠지는데, 커버리지 검사는 파이프라인 자기 목록만 보고
통과한다. 급부상 한 줄 요약·테마 급부상(tickers=…)은 따로 창을 정하므로 그대로 둔다.
"""
import generate_us_telegram_narratives as US

BASE = "2026-09-29"


def _msgs(plan):
    """plan: [(날짜, 티커, 건수)] → load_us_messages 가 주는 꼴의 메시지."""
    out = []
    for date, ticker, n in plan:
        for i in range(n):
            out.append({
                "date": date,
                "channel_handle": f"ch{i % 7}",
                "message_id": len(out) + 1,
                "text": f"{ticker} 이야기 {i}",
                "views": i,
                "mentions": [{"ticker": ticker, "match_text": ticker, "method": "dict"}],
            })
    return out


# AAA 는 기준일 앞 사흘째(09-26)에만, BBB 는 기준일(09-29)에만 몰렸다. C1~C5 는 09-27~28.
PLAN = [
    ("2026-09-26", "AAA", 60),
    ("2026-09-29", "BBB", 70),
    ("2026-09-27", "C1", 20), ("2026-09-28", "C1", 20),
    ("2026-09-27", "C2", 18), ("2026-09-28", "C2", 17),
    ("2026-09-27", "C3", 15), ("2026-09-28", "C3", 15),
    ("2026-09-27", "C4", 13), ("2026-09-28", "C4", 12),
    ("2026-09-27", "C5", 10), ("2026-09-28", "C5", 10),
]
NAMES = {}


def test_card_window_is_three_days_before_base():
    assert US.card_window(BASE) == ("2026-09-26", "2026-09-28")


def test_required_is_the_tables_rows():
    # 표: 09-26~09-28 언급 수 → AAA 60 · C1 40 · C2 35 · C3 30 · C4 25 · C5 20. 표가 열 줄이라(CARD_TOP_N) 있는 여섯 모두 요약이 있어야 한다.
    _digests, required = US.build_stock_digests(BASE, _msgs(PLAN), NAMES)
    assert [t for t, _n in required] == ["AAA", "C1", "C2", "C3", "C4", "C5"]


def test_digests_cover_card_tickers_and_card_days_only():
    digests, _ = US.build_stock_digests(BASE, _msgs(PLAN), NAMES)
    assert [t for t, _n, _d in digests] == ["AAA", "C1", "C2", "C3", "C4", "C5"]
    c1 = next(d for t, _n, d in digests if t == "C1")
    assert "[일별] 09-27 20회 · 09-28 20회" in c1
    assert all("09-29" not in d for _t, _n, d in digests)


def test_tickers_mode_keeps_base_inclusive_window():
    # 테마 급부상(us_theme_risers)은 기준일을 넣어 세므로 그 종목의 기준일 글이 digest 에 들어야 한다.
    digests, required = US.build_stock_digests(BASE, _msgs(PLAN), NAMES, tickers=["BBB", "AAA"])
    assert [t for t, _n, _d in digests] == ["BBB"]
    assert "[일별] 09-29 70회" in digests[0][2]
    assert required == [("BBB", "BBB")]


def test_excerpts_reach_the_base_day_but_counts_do_not():
    # 국장 종목 요약과 같은 규칙 — 세는 값은 카드의 사흘, 발췌는 기준일 것까지(아침 실행의 밤사이 마감 소식).
    plan = PLAN + [("2026-09-29", "C1", 5)]
    msgs = _msgs(plan)
    for m in msgs:
        if m["date"] == "2026-09-29" and m["mentions"][0]["ticker"] == "C1":
            m["views"] = 10_000
            m["text"] = "C1 밤사이 마감 소식"
    digests, required = US.build_stock_digests(BASE, msgs, NAMES)
    c1 = next(d for t, _n, d in digests if t == "C1")
    assert "[최근 3일] 언급 40회" in c1
    assert "[일별] 09-27 20회 · 09-28 20회" in c1
    assert "C1 밤사이 마감 소식" in c1
    assert [t for t, _n in required] == ["AAA", "C1", "C2", "C3", "C4", "C5"]
