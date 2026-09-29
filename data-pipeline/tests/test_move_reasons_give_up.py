"""까닭 생성기가 '못 얻은 까닭'과 '까닭 없음'을 가르는지 — 호출이 다 깨진 날 멀쩡한 행을 NULL 로 덮지 않는다.

NULL 은 "그날 언급은 있었지만 까닭을 말한 글이 없다"(마이그레이션 066)이고 종목 화면은 그걸
"커뮤니티에서 이유를 말한 곳이 없습니다"로 적는다. 호출이 세 번 다 깨진 종목까지 NULL 로 쓰면
토요일 10:30 판의 멀쩡한 미장 까닭을 저녁 실행이 지우고 그 문장이 뜬다.
"""
import json
import types

import generate_move_reasons as M


class _Boom:
    """구독·API 가 다 막힌 날(529 과부하)의 클라이언트."""

    class messages:
        @staticmethod
        def create(**_kw):
            raise RuntimeError("Error code: 529 - overloaded_error")


class _Says:
    """물을 때마다 같은 답을 낸다. reasons[i] 가 `### i+1` 의 답이다."""

    def __init__(self, reasons):
        self.messages, self.reasons = self, reasons

    def create(self, **_kw):
        body = json.dumps({"results": [{"n": i, "reason": r} for i, r in enumerate(self.reasons, 1)]})
        return types.SimpleNamespace(content=[types.SimpleNamespace(type="text", text=body)])


DIGEST = "[종목] 엔비디아 (NVDA)\n- 엔비디아 +8.2% 실적 가이던스 상향 기대에 급등"


def test_failed_calls_are_left_out():
    assert M.ask(_Boom(), [("NVDA", "엔비디아", DIGEST), ("TSLA", "테슬라", DIGEST)]) == {}


def test_check_failures_after_retries_are_left_out():
    # 까닭은 있었는데 퍼센트를 되풀이해 적었다 — "말한 곳이 없다"가 아니다.
    assert M.ask(_Says(["실적 가이던스 상향 기대로 8% 급등"]), [("NVDA", "엔비디아", DIGEST)]) == {}


def test_honest_empty_and_good_sentences_are_kept():
    assert M.ask(_Says([""]), [("NVDA", "엔비디아", DIGEST)]) == {"NVDA": ""}
    assert M.ask(_Says(["실적 가이던스 상향 기대"]), [("NVDA", "엔비디아", DIGEST)]) == {"NVDA": "실적 가이던스 상향 기대"}


# ── run_market: 가짜 표 위에서 저장·정리 ─────────────────────────────────────────

class _Q:
    def __init__(self, rows):
        self.rows, self.op, self.eqs, self.ins, self.payload = rows, None, {}, {}, None

    def select(self, _cols):
        self.op = "select"
        return self

    def upsert(self, rows, on_conflict=None):
        self.op, self.payload = "upsert", rows
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, col, v):
        self.eqs[col] = v
        return self

    def in_(self, col, vs):
        self.ins[col] = set(vs)
        return self

    def range(self, *_a):
        return self

    def _hit(self, r):
        return all(r.get(c) == v for c, v in self.eqs.items()) and all(r.get(c) in vs for c, vs in self.ins.items())

    def execute(self):
        if self.op == "upsert":
            for r in self.payload:
                self.rows[(r["date"], r["ticker"])] = dict(r)
        elif self.op == "delete":
            for k in [k for k, r in self.rows.items() if self._hit(r)]:
                del self.rows[k]
        return types.SimpleNamespace(data=[r for r in self.rows.values() if self._hit(r)])


class _DB:
    def __init__(self, rows):
        self.rows = rows

    def table(self, _name):
        return _Q(self.rows)


DAY = "2026-09-26"


def _run(monkeypatch, client, earlier):
    msgs = {
        ("a", 1): {"channel_handle": "a", "message_id": 1, "views": 100, "text": "엔비디아 +8.2% 실적 가이던스 상향 기대에 급등"},
        ("b", 2): {"channel_handle": "b", "message_id": 2, "views": 90, "text": "테슬라 +7.5% 로보택시 확대 발표로 강세"},
    }
    monkeypatch.setattr(M, "load_keyset", lambda db, t, cols, narrow=None: [
        {"id": 1, "ticker": "NVDA", "mention_count": 30, "channel_count": 8, "weighted_score": 50},
        {"id": 2, "ticker": "TSLA", "mention_count": 20, "channel_count": 6, "weighted_score": 40},
    ])
    monkeypatch.setattr(M, "load_day_messages", lambda db, d: msgs)
    monkeypatch.setattr(M, "load_all_keyset", lambda db, t, cols: [
        {"id": 1, "channel_handle": "a", "message_id": 1, "ticker": "NVDA", "match_text": "엔비디아", "method": "name"},
        {"id": 2, "channel_handle": "b", "message_id": 2, "ticker": "TSLA", "match_text": "테슬라", "method": "name"},
    ])
    monkeypatch.setattr(M, "attach_texts", lambda db, rows: None)
    monkeypatch.setattr(M, "load_all", lambda db, t, cols, order_by=None: [
        {"ticker": "NVDA", "name_ko": "엔비디아"}, {"ticker": "TSLA", "name_ko": "테슬라"},
    ])
    rows = {(DAY, t): {"date": DAY, "ticker": t, "reason": r} for t, r in earlier.items()}
    M.run_market(_DB(rows), client, M.MARKETS["us"], DAY, dry_run=False)
    return {t: r["reason"] for (_d, t), r in rows.items()}


def test_outage_keeps_the_earlier_run(monkeypatch):
    # 토요일 10:30 판이 쓴 까닭 위에 저녁 실행이 전부 실패했다. 후보에서 빠진 GS 만 지운다.
    earlier = {"NVDA": "실적 가이던스 상향 기대", "TSLA": "로보택시 확대 발표 소식", "GS": "트레이딩 수익 정체 우려"}
    assert _run(monkeypatch, _Boom(), earlier) == {"NVDA": "실적 가이던스 상향 기대", "TSLA": "로보택시 확대 발표 소식"}


def test_honest_empty_is_still_saved_as_null(monkeypatch):
    assert _run(monkeypatch, _Says(["", ""]), {"NVDA": "실적 가이던스 상향 기대"}) == {"NVDA": None, "TSLA": None}
