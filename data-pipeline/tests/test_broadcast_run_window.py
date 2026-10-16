"""common/broadcast_digest 의 실행 몫 창(run_window) — 아침 · 저녁 글이 '그 실행이 처음 모은 글'을 다룬다(2026-10-17).

글이 올라온 시각으로 자르던 시계 창은 실행이 글을 모으는 시각과 어긋나, 아침 수집 뒤 ~ 07:00 · 저녁 수집 뒤 ~ 18:00 에
올라온 글이 어느 글에도 안 들어갔다. 여기서는 그 틈의 글이 정확히 한 글에만 들어가는지를 가짜 표로 본다.
"""
from datetime import date, datetime, timedelta, timezone

import common.broadcast_digest as BD
from common.timeutil import KST

D = date(2026, 10, 16)  # 금요일


def k(d: date, hm: str) -> datetime:
    h, m = map(int, hm.split(":"))
    return datetime(d.year, d.month, d.day, h, m, tzinfo=KST)


def utc(x: datetime) -> str:
    return x.astimezone(timezone.utc).isoformat()


# (이름, 올라온 시각, 처음 모은 시각)
PREV, NEXT = D - timedelta(days=1), D + timedelta(days=1)
MSGS = [
    ("A", k(PREV, "17:40"), k(PREV, "17:45")),  # 전날 저녁 실행이 모은 글
    ("B", k(PREV, "17:55"), k(D, "06:25")),     # 전날 저녁 수집 뒤 ~ 18:00 — 예전엔 두 글 다 빠졌다
    ("C", k(D, "02:00"), k(D, "06:25")),
    ("D", k(D, "06:20"), k(D, "06:25")),
    ("E", k(D, "06:50"), k(D, "17:30")),        # 아침 수집 뒤 ~ 07:00 — 예전엔 두 글 다 빠졌다
    ("F", k(D, "15:00"), k(D, "17:30")),
    ("G", k(D, "17:50"), k(NEXT, "06:25")),
    ("H", k(D - timedelta(days=5), "10:00"), k(D, "06:25")),  # 새로 들인 채널의 옛 글 — 어느 글에도 안 든다
]
ROWS = [
    {"id": f"{i:04d}", "channel_handle": f"ch{n}", "message_id": i, "text": f"글 {n} 본문입니다", "views": 100, "forwards": 0,
     "posted_at": utc(p), "collected_at": utc(c), "_name": n}
    for i, (n, p, c) in enumerate(MSGS, 1)
]
TS_COLS = {"posted_at", "collected_at"}


def _val(col, v):
    if col in TS_COLS:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return v


class _Q:
    """telegram_messages 만 흉내 낸다. 다른 표(종목 태그)는 빈 표다."""

    def __init__(self, rows):
        self.rows, self.ops, self._order, self._limit = rows, [], None, None

    def select(self, *_a, **_k):
        return self

    def _f(self, col, v, op):
        self.ops.append((col, _val(col, v), op))
        return self

    def gte(self, c, v):
        return self._f(c, v, lambda a, b: a >= b)

    def lt(self, c, v):
        return self._f(c, v, lambda a, b: a < b)

    def gt(self, c, v):
        return self._f(c, v, lambda a, b: a > b)

    def in_(self, c, vs):
        self.ops.append((c, set(vs), lambda a, b: a in b))
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, a, b):
        self._limit = b - a + 1
        return self

    def execute(self):
        out = [r for r in self.rows if all(op(_val(c, r[c]), v) for c, v, op in self.ops)]
        if self._order:
            col, desc = self._order
            out.sort(key=lambda r: _val(col, r[col]), reverse=desc)
        if self._limit is not None:
            out = out[: self._limit]
        return type("R", (), {"data": out})()


class _DB:
    def table(self, name):
        return _Q(ROWS if name == "telegram_messages" else [])


def names(mat) -> set[str]:
    by_mid = {r["message_id"]: r["_name"] for r in ROWS}
    return {by_mid[e.message_id] for e in mat.excerpts}


def material(day: date, slot: str, monkeypatch):
    monkeypatch.setattr(BD, "MIN_WINDOW_MSGS", 1)
    now = k(day + timedelta(days=2), "00:00")
    return BD.load_material_with_fallback(_DB(), lambda back: BD.run_window(day - timedelta(days=back), slot, now), 50)


def test_run_windows_tile_time_without_gaps():
    # 처음 모은 시각 범위가 전날 저녁 → 아침 → 저녁 → 다음 날 아침으로 빈틈없이 이어진다.
    now = k(NEXT, "23:00")
    seq = [BD.run_window(PREV, "evening", now), BD.run_window(D, "morning", now), BD.run_window(D, "evening", now),
           BD.run_window(NEXT, "morning", now)]
    for a, b in zip(seq, seq[1:]):
        assert a.collected[1] == b.collected[0]
        assert b.prev_collected == a.collected


def test_each_message_lands_in_exactly_one_post(monkeypatch):
    got = {
        ("prev", "evening"): names(material(PREV, "evening", monkeypatch)),
        ("d", "morning"): names(material(D, "morning", monkeypatch)),
        ("d", "evening"): names(material(D, "evening", monkeypatch)),
        ("next", "morning"): names(material(NEXT, "morning", monkeypatch)),
    }
    assert got[("prev", "evening")] == {"A"}
    assert got[("d", "morning")] == {"B", "C", "D"}   # 전날 17:55 글(B)이 들어온다
    assert got[("d", "evening")] == {"E", "F"}        # 아침 06:50 글(E)이 들어온다
    assert got[("next", "morning")] == {"G"}
    seen = [n for s in got.values() for n in s]
    assert sorted(seen) == ["A", "B", "C", "D", "E", "F", "G"]  # 겹침 없음 · 옛 글(H) 없음


def test_window_runs_from_previous_runs_last_post_to_this_runs_last_post(monkeypatch):
    lo, hi = material(D, "morning", monkeypatch).window
    assert (lo, hi) == (k(PREV, "17:40"), k(D, "06:20"))
    assert BD.span_label(lo, hi) == "10월 15일 17시 ~ 10월 16일 6시"
    lo, hi = material(D, "evening", monkeypatch).window
    assert (lo, hi) == (k(D, "06:20"), k(D, "15:00"))


def test_morning_task_says_the_window_hours(monkeypatch):
    mat = material(D, "morning", monkeypatch)
    got = {}

    class Client:
        class messages:  # noqa: N801 — anthropic 클라이언트 모양을 흉내 낸다
            @staticmethod
            def create(**kw):
                got.update(kw)
                return type("R", (), {"content": []})()

    BD.compose_sections(Client, "m", "morning2", "자료", mat)
    assert "어젯밤 17시부터 오늘 아침 6시까지" in got["system"]


def test_late_morning_collection_falls_back_to_the_clock_window(monkeypatch):
    # 아침 실행이 12시를 넘겨 글을 모은 날 — 이번 몫(04~12시)은 비지만 그날 밤 글은 시계 창으로 쓴다.
    late = {"id": "9999", "channel_handle": "late", "message_id": 9999, "text": "늦게 모은 밤 글", "views": 1, "forwards": 0,
            "posted_at": utc(k(NEXT, "05:00")), "collected_at": utc(k(NEXT, "13:10")), "_name": "L"}
    monkeypatch.setattr(BD, "MIN_WINDOW_MSGS", 1)
    rows = [r for r in ROWS if r["_name"] != "G"] + [late]

    class DB(_DB):
        def table(self, name):
            return _Q(rows if name == "telegram_messages" else [])

    now = k(NEXT, "13:30")
    mat = BD.load_material_with_fallback(DB(), lambda back: BD.run_window(NEXT - timedelta(days=back), "morning", now), 50)
    assert {e.message_id for e in mat.excerpts} == {9999}
    assert mat.window == BD.night_window(NEXT)


def test_both_builders_use_run_windows(monkeypatch):
    # 아침 · 저녁 글 조립부가 실행 몫 창을 넘기는지 — 시계 창으로 되돌아가면 틈이 다시 생긴다.
    seen = {}

    def fake(db, window_of, n):
        seen.setdefault("w", []).append(window_of(0))
        return BD.Material(excerpts=[], kr_names={}, us_names={}, window=BD.night_window(D), total=0)

    monkeypatch.setattr(BD, "load_material_with_fallback", fake)
    now = k(D, "19:00")
    BD.build_morning2(None, None, "m", None, D, now, False)
    BD.build_evening2(None, None, "m", None, D, now, False)
    w_m, w_e = seen["w"]
    assert isinstance(w_m, BD.RunWindow) and w_m.collected == (k(D, "04:00"), k(D, "12:00"))
    assert isinstance(w_e, BD.RunWindow) and w_e.collected == (k(D, "12:00"), k(NEXT, "04:00"))
