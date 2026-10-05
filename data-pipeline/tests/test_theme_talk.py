"""테마 상세 '말 많은 종목'의 요즘 도는 얘기 — 줄 고르기(common/theme_hot.py)와 한 줄 쓰기(generate_theme_briefs write_talk).

줄 고르기는 화면(lib/theme-page.ts buildHotStocks)과 같은 차례여야 한다 — 어긋나면 그 줄이 빈다.
"""
from common.theme_hot import pick_hot, recent_days, trend_days
from generate_theme_briefs import (
    TALK_LEN_MAX,
    TALK_LEN_MIN,
    TALK_NONE,
    parse_talk,
    talk_pick,
    talk_problems,
    write_talk,
)


def test_pick_hot_orders_like_screen():
    rows = [
        {"date": "2026-10-03", "stock_code": "A", "mention_count": 5, "weighted_score": 1},
        {"date": "2026-10-04", "stock_code": "B", "mention_count": 5, "weighted_score": 3},
        {"date": "2026-10-04", "stock_code": "C", "mention_count": 9, "weighted_score": 0},
        {"date": "2026-10-04", "stock_code": "D", "mention_count": 5, "weighted_score": 1},
        {"date": "2026-09-20", "stock_code": "E", "mention_count": 99, "weighted_score": 9},  # 최근 밖
        {"date": "2026-10-04", "stock_code": "X", "mention_count": 50, "weighted_score": 9},  # 테마 밖
    ]
    got = pick_hot(rows, "stock_code", {"반도체": ["A", "B", "C", "D", "E"]}, {"2026-10-03", "2026-10-04", "2026-10-05"}, 3)
    # 언급 내림 → 주목도 내림 → 코드 오름. 최근 언급 0 인 E 는 빠진다.
    assert got == {"반도체": ["C", "B", "A"]}


def test_recent_days_skip_thin_morning():
    base = "2026-10-05"
    totals = {d: 1000 for d in trend_days(base)}
    totals[base] = 4  # 기준일 아침 몇 시간치
    assert recent_days(totals, base) == ["2026-10-02", "2026-10-03", "2026-10-04"]


def test_parse_talk_lines():
    text = "1|HBM 공급 일정 이야기가 돌았습니다\n[2] | 신규 수주 소식이 화제였습니다\n머리말\n3|-\n1|두 번째 1번"
    assert parse_talk(text) == {1: "HBM 공급 일정 이야기가 돌았습니다", 2: "신규 수주 소식이 화제였습니다", 3: "-"}


def test_talk_problems():
    digest = "- 엔비디아 HBM 납품 기대가 커졌다는 글"
    assert talk_problems("엔비디아 HBM 납품 기대가 화제였습니다", digest, "삼성전자") == []
    assert any("이름으로 시작" in f for f in talk_problems("삼성전자 HBM 납품 기대가 화제였습니다", digest, "삼성전자"))
    assert any("매수·매도" in f for f in talk_problems("증권사 매수 의견 이야기가 돌았습니다", digest, "x"))
    assert any("추이" in f for f in talk_problems("납품 기대로 관심이 부쩍 늘었습니다", digest, "x"))
    long = "엔비디아 납품 기대와 함께 차세대 제품 출시 일정 이야기가 길게 돌았습니다"
    assert any(f.startswith(f"{len(long)}자") for f in talk_problems(long, digest, "x"))


def test_talk_pick():
    ok = "엔비디아 HBM 납품 기대가 화제였습니다"
    assert TALK_LEN_MIN <= len(ok) <= TALK_LEN_MAX
    assert talk_pick(["증권사 매수 의견 이야기가 돌았습니다", ok], "") == ok
    assert talk_pick(["증권사 매수 의견 이야기가 돌았습니다"], "") is None
    assert talk_pick([], "") is None


def test_write_talk_retries_only_failed_lines():
    asked = []

    def ask(system, user):
        asked.append(user)
        if len(asked) == 1:
            return "1|엔비디아 HBM 납품 기대가 화제였습니다\n2|" + "가" * 40 + "\n3|" + TALK_NONE
        assert "[1]" not in user and "[3]" not in user and "[2] 나" in user  # 걸린 2번만 다시 묻는다
        return "2|신규 반도체 공장 증설 소식이 화제였습니다"

    items = [("A", "가", "- 엔비디아 HBM 납품"), ("B", "나", "- 신규 반도체 공장 증설"), ("C", "다", "- 등락률 목록")]
    got = write_talk(ask, "sys", "반도체", items)
    assert got == {"A": "엔비디아 HBM 납품 기대가 화제였습니다", "B": "신규 반도체 공장 증설 소식이 화제였습니다"}
    assert len(asked) == 2
