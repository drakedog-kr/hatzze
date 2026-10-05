"""방송 테마 글의 점유율 변화가 사이트와 같은 '1주 전 대비'인지 — 최근 사흘을 1주 전 같은 사흘과 견준다.

예전엔 '5일 이상 전 평균'(5~14일 전)과 견줬고 사이트는 그걸 '1~2주 전 대비'로 적었다. 2026-10-05 에 화면 글자를
'1주 전 대비'로 통일하면서 셈도 바꿨다(lib/theme-flow.ts weekAgoDates). 이 글은 본문에 사이트 링크를 달고 나가
두 숫자가 같아야 한다.
"""
import types
from datetime import date, timedelta

import common.broadcast_content as bc

DAYS = [(date(2026, 9, 21) + timedelta(days=i)).isoformat() for i in range(14)]  # 09-21 ~ 10-04


def _rows():
    rows = []
    for d in DAYS:
        # 1주 전 같은 사흘(09-25~27)만 반도체가 60%, 그 밖의 옛 날은 40%, 최근 사흘(10-02~04)은 58%.
        semi = 58.0 if d >= "2026-10-02" else 60.0 if "2026-09-25" <= d <= "2026-09-27" else 40.0
        rows += [
            {"date": d, "theme": "반도체", "share_pct": semi, "mention_count": 600},
            {"date": d, "theme": "바이오", "share_pct": 100 - semi, "mention_count": 400},
        ]
    return rows


class _Q:
    def __getattr__(self, _name):
        return lambda *_a, **_k: self

    def execute(self):
        return types.SimpleNamespace(data=_rows())


class _DB:
    def table(self, _name):
        return _Q()


def test_delta_is_against_same_three_days_a_week_ago(monkeypatch):
    monkeypatch.setattr(bc, "today_kst", lambda: date(2026, 10, 4))
    out = {t["theme"]: t for t in bc.load_theme_rotation(_DB())}
    semi = out["반도체"]
    assert semi["dates"] == ["2026-10-02", "2026-10-03", "2026-10-04"]
    assert abs(semi["share"] - 58.0) < 1e-9
    # 1주 전 같은 사흘 평균 60% 와 견준다 — 옛 규칙(5~14일 전 평균)이면 +12%p 남짓이 나왔다.
    assert abs(semi["delta"] - (-2.0)) < 1e-9
    assert semi["rank_change"] == 0
