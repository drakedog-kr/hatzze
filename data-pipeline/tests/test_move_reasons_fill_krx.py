"""국장 까닭 줄의 KRX 등락률 채우기 — 날짜별 종가 이력이 먼저고, stocks 의 최신 하루치는 그 날짜일 때만.

채우기가 까닭 스텝 안에만 있어 아침(08:00 공표 전)엔 늘 0행이었고, 전날 줄은 이튿날 19시께까지 테마 화면에서
'종가 전'이었다(generate_move_reasons.py 머리 '등락률은 이튿날 아침'). 이제 배당 잡이 08:00 뒤 `--fill-only` 로 부른다.
DB·LLM 은 부르지 않는다.
"""
import types
from datetime import date

import generate_move_reasons as M


# ── 한 줄의 값 고르기 ───────────────────────────────────────────────────────────

ROW = {"stock_code": "005930", "date": "2026-10-08"}


def test_history_comes_first():
    hist = {("005930", "2026-10-08"): {"change_rate": -2.42, "close": 262000}}
    latest = {"005930": {"price_date": "2026-10-08", "change_rate": 9.99, "close_price": 1}}
    assert M.krx_quote(ROW, hist, latest) == (-2.42, 262000)


def test_latest_day_only_when_it_is_that_date():
    latest = {"005930": {"price_date": "2026-10-08", "change_rate": -2.42, "close_price": 262000}}
    assert M.krx_quote(ROW, {}, latest) == (-2.42, 262000)
    # stocks 가 이미 다음 거래일로 넘어갔다 — 그 값은 이 줄의 등락이 아니다.
    moved_on = {"005930": {"price_date": "2026-10-12", "change_rate": 1.0, "close_price": 265000}}
    assert M.krx_quote(ROW, {}, moved_on) is None


def test_not_published_yet_is_none():
    assert M.krx_quote(ROW, {}, {}) is None
    hist = {("005930", "2026-10-08"): {"change_rate": None, "close": None}}
    assert M.krx_quote(ROW, hist, {}) is None


# ── fill_krx: 가짜 표 위에서 ─────────────────────────────────────────────────────

class _Q:
    def __init__(self, db, name):
        self.db, self.name, self.f, self.op, self.payload = db, name, {}, "select", None

    def select(self, _cols):
        return self

    def is_(self, c, _v):
        self.f[c] = ("null",)
        return self

    def gte(self, c, v):
        self.f[c] = (">=", v)
        return self

    def eq(self, c, v):
        self.f[c] = ("=", v)
        return self

    def in_(self, c, vs):
        self.f[c] = ("in", set(vs))
        return self

    def range(self, *_a):
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def _hit(self, r):
        for c, cond in self.f.items():
            v = r.get(c)
            if cond[0] == "null" and v is not None:
                return False
            if cond[0] == ">=" and not v >= cond[1]:
                return False
            if cond[0] == "=" and v != cond[1]:
                return False
            if cond[0] == "in" and v not in cond[1]:
                return False
        return True

    def execute(self):
        rows = [r for r in self.db.tables[self.name] if self._hit(r)]
        if self.op == "update":
            self.db.updates.append((self.name, dict(self.f), self.payload))
            for r in rows:
                r.update(self.payload)
        return types.SimpleNamespace(data=rows)


class _DB:
    def __init__(self, tables):
        self.tables, self.updates = tables, []

    def table(self, name):
        return _Q(self, name)


def _db():
    return _DB({
        M.TABLE: [
            {"id": 1, "date": "2026-10-07", "stock_code": "005930", "change_rate": None},  # 이력에 있다
            {"id": 2, "date": "2026-10-08", "stock_code": "000660", "change_rate": None},  # 이력엔 없고 stocks 가 그날이다
            {"id": 3, "date": "2026-10-08", "stock_code": "035720", "change_rate": None},  # 아직 아무 데도 없다
            {"id": 4, "date": "2026-10-08", "stock_code": "005930", "change_rate": -2.42},  # 이미 채워졌다
        ],
        "stock_price_daily": [
            {"code": "005930", "date": "2026-10-07", "close": 268500, "change_rate": -1.29},
        ],
        "stocks": [
            {"code": "005930", "close_price": 262000, "change_rate": -2.42, "price_date": "2026-10-08"},
            {"code": "000660", "close_price": 400000, "change_rate": 1.5, "price_date": "2026-10-08"},
            {"code": "035720", "close_price": 50000, "change_rate": 0.3, "price_date": "2026-10-02"},
        ],
    })


def test_fill_uses_history_then_latest_day(monkeypatch):
    monkeypatch.setattr(M, "today_kst", lambda: date(2026, 10, 11))
    db = _db()
    assert M.fill_krx(db, dry_run=False) == 2
    got = {r["id"]: (r["change_rate"], r.get("close_price")) for r in db.tables[M.TABLE]}
    # 10-07 줄은 stocks(10-08)로는 못 채웠다 — 예전 길이면 영영 빈칸이었다.
    assert got[1] == (-1.29, 268500)
    assert got[2] == (1.5, 400000)
    assert got[3] == (None, None)


def test_dry_run_writes_nothing(monkeypatch):
    monkeypatch.setattr(M, "today_kst", lambda: date(2026, 10, 11))
    db = _db()
    assert M.fill_krx(db, dry_run=True) == 2
    assert db.updates == []


def test_fill_prints_the_count_the_workflow_reads(monkeypatch, capsys):
    # daily-update.yml 의 '등락 이유 등락률 채우기' 가 이 줄에서 숫자를 뽑아 화면 비우기를 가른다.
    monkeypatch.setattr(M, "today_kst", lambda: date(2026, 10, 11))
    M.fill_krx(_db(), dry_run=True)
    assert "[KRX] 확정 등락률 채움 2행 (대상 3행)" in capsys.readouterr().out
    M.fill_krx(_DB({M.TABLE: [], "stock_price_daily": [], "stocks": []}), dry_run=True)
    assert "[KRX] 확정 등락률 채움 0행" in capsys.readouterr().out


# ── --fill-only ────────────────────────────────────────────────────────────────

def test_fill_only_needs_no_llm(monkeypatch):
    calls = []
    monkeypatch.setattr(M, "HAS_LLM_CREDENTIAL", False)  # 배당 잡엔 LLM 이 필요 없다
    monkeypatch.setattr(M, "get_client", lambda: "db")
    monkeypatch.setattr(M, "fill_krx", lambda db, dry_run: calls.append(("fill", db, dry_run)) or 0)

    def boom(*_a, **_k):
        raise AssertionError("--fill-only 에서 까닭을 만들었다")

    monkeypatch.setattr(M, "run_market", boom)
    monkeypatch.setattr(M, "missing_days", boom)
    monkeypatch.setattr(M.sys, "argv", ["generate_move_reasons.py", "--fill-only"])
    M.main()
    assert calls == [("fill", "db", False)]
