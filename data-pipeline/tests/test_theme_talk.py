"""테마 상세 '말 많은 종목'의 요즘 도는 얘기 — 줄 고르기(common/theme_hot.py)와 한 줄 쓰기(generate_theme_briefs write_talk).

줄 고르기는 화면(lib/theme-page.ts buildHotStocks)과 같은 차례여야 한다 — 어긋나면 그 줄이 빈다.
"""
from common.theme_hot import pick_hot, recent_days, trend_days
import json

from generate_theme_briefs import (
    TALK_LEN_MAX,
    TALK_LEN_MIN,
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


def _json(pairs):
    return json.dumps({"results": [{"n": n, "talk": t} for n, t in pairs]}, ensure_ascii=False)


def test_parse_talk():
    assert parse_talk(_json([(1, "HBM 공급 일정 소식."), (2, ""), (1, "두 번째 1번")])) == {1: "HBM 공급 일정 소식", 2: ""}
    assert parse_talk("깨진 응답") == {}


def test_talk_problems():
    digest = "- 엔비디아 HBM 납품 기대가 커졌다는 글"
    assert talk_problems("엔비디아 HBM 납품 기대", digest, "삼성전자") == []
    assert any("이름으로 시작" in f for f in talk_problems("삼성전자 HBM 납품 기대", digest, "삼성전자"))
    assert any("매수·매도" in f for f in talk_problems("증권사 매수 의견 보고서", digest, "x"))
    assert any("매수·매도" in f for f in talk_problems("태양광 업종 탑픽 선정 이야기", digest, "x"))
    assert any("시세" in f for f in talk_problems("도시바 증설 소식에 주가 하락", digest, "x"))
    assert any("추이" in f for f in talk_problems("납품 기대로 관심이 부쩍 늘어", digest, "x"))
    # 2026-10-05 첫 리허설에서 나온 꼴 둘 — 문장으로 끝맺기 · 띄어쓰기 통째로 빼기
    assert any("명사형" in f for f in talk_problems("외주 물량이 확대됩니다", digest, "x"))
    assert any("띄어쓰기" in f for f in talk_problems("미국ESS시장성장과실적개선기대", digest, "x"))
    long = "엔비디아 납품 기대와 함께 차세대 제품 출시 일정 이야기"
    assert any(f.startswith(f"{len(long)}자") for f in talk_problems(long, digest, "x"))


def test_talk_pick():
    ok = "엔비디아 HBM 납품 기대"
    assert TALK_LEN_MIN <= len(ok) <= TALK_LEN_MAX
    assert talk_pick(["증권사 매수 의견 보고서 소식", ok], "") == ok
    assert talk_pick(["외주 물량이 확대됩니다", ok], "") == ok
    assert talk_pick(["증권사 매수 의견 보고서 소식"], "") is None
    assert talk_pick([], "") is None


def test_write_talk_retries_only_failed_lines():
    asked = []

    def ask(system, user):
        asked.append(user)
        if len(asked) == 1:
            return _json([(1, "엔비디아 HBM 납품 기대"), (2, "가" * 40), (3, "")])
        assert "### 1" not in user and "### 3" not in user and "### 2 나" in user  # 걸린 2번만 다시 묻는다
        return _json([(2, "신규 반도체 공장 증설 소식")])

    items = [("A", "가", "- 엔비디아 HBM 납품"), ("B", "나", "- 신규 반도체 공장 증설"), ("C", "다", "- 등락률 목록")]
    got = write_talk(ask, "sys", "반도체", items)
    assert got == {"A": "엔비디아 HBM 납품 기대", "B": "신규 반도체 공장 증설 소식"}
    assert len(asked) == 2


def test_write_talk_same_line_twice():
    calls = []

    def ask(system, user):
        calls.append(user)
        if len(calls) == 1:
            return _json([(1, "바이오 학회 발표 일정 정리"), (2, "바이오 학회 발표 일정 정리")])
        return _json([(2, "바이오 학회 발표 일정 정리")])  # 다시 물어도 같은 줄

    got = write_talk(ask, "sys", "바이오", [("A", "가", "- 학회"), ("B", "나", "- 학회")])
    assert got == {"A": "바이오 학회 발표 일정 정리"}  # 같은 문장이 두 줄에 서지 않는다
    assert "가 줄과 같음" in calls[1]
