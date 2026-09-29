"""저녁 브리핑 '🆕 오늘 처음 회자된 종목'이 급부상 상위 열 종목을 다 보는지 — 카드 정원(5)에서 멈추지 않는다.

top_surging 은 `cap` 을 안 주면 정원 CARD_LIMIT(5)까지만 세운 뒤 limit 으로 자른다. load_new_faces 가
10 만 주고 cap 을 빠뜨려서, 상위 다섯이 한 채널짜리인 날엔 6~10위의 새 종목(채널 둘 이상)이 있어도
블록이 통째로 빠졌다.
"""
import types
from datetime import date, timedelta

import common.broadcast_digest as BD
import common.surging as SG

DAYS = [(date(2026, 9, 15) + timedelta(days=i)).isoformat() for i in range(14)]


def _rows():
    rows = [
        {"date": d, "stock_code": f"OLD{k:03d}", "weighted_score": 10, "mention_count": 5}
        for d in DAYS for k in range(50)
    ]
    # 마지막 사흘에 새 종목 열이 나온다. 급부상 순서는 코드 순(NEW00 → NEW09).
    rows += [
        {"date": d, "stock_code": f"NEW{k:02d}", "weighted_score": 30 - k, "mention_count": 10}
        for d in DAYS[-3:] for k in range(10)
    ]
    return rows


class _Q:
    def __init__(self, table):
        self.table = table

    def __getattr__(self, _name):
        return lambda *_a, **_k: self

    def execute(self):
        if self.table == "stocks":
            return types.SimpleNamespace(data=[{"code": f"NEW{k:02d}", "name": f"새종목{k}"} for k in range(10)])
        return types.SimpleNamespace(data=[])


class _DB:
    def table(self, name):
        return _Q(name)


def test_new_faces_look_past_the_card_quota(monkeypatch):
    rows = _rows()
    # 상위 다섯(NEW00~04)은 한 채널뿐, 6~10위(NEW05~09)는 네 채널.
    breadth = {f"NEW{k:02d}": 1 if k < 5 else 4 for k in range(10)}
    monkeypatch.setattr(SG, "channel_breadth_map", lambda db, codes, a, b: {c: breadth.get(c, 3) for c in codes})
    monkeypatch.setattr(BD, "load_stock_daily", lambda db, base: (rows, DAYS))
    faces = BD.load_new_faces(_DB(), date(2026, 9, 29))
    assert [f["code"] for f in faces] == ["NEW05", "NEW06", "NEW07"]
