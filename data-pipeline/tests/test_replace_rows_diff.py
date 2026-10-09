"""common/supabase_client.replace_rows — 큰 표는 바뀐 행만 쓰고, 다 쓴 뒤 표가 계산과 똑같은지 다시 읽어 확인한다.

메모리 위 가짜 표로 PostgREST 의 select(키셋) · upsert(on_conflict) · delete(in_ · lt · eq) 만 흉내 낸다.
"""
import json
from datetime import datetime

import pytest

import common.supabase_client as SC
from common.timeutil import KST


class _Q:
    def __init__(self, t, op, payload=None, on_conflict=None):
        self.t, self.op, self.payload, self.on_conflict = t, op, payload, on_conflict
        self.filters = []
        self.cols = None
        self.lim = None

    def select(self, cols):
        self.op, self.cols = "select", [c.strip() for c in cols.split(",")]
        return self

    def order(self, key):
        return self

    def limit(self, n):
        self.lim = n
        return self

    def gt(self, col, v):
        self.filters.append(lambda r: str(r[col]) > str(v))
        return self

    def lt(self, col, v):
        self.filters.append(lambda r: r[col] < v)
        return self

    def eq(self, col, v):
        self.filters.append(lambda r: r[col] == v)
        return self

    def in_(self, col, vs):
        vs = set(vs)
        self.filters.append(lambda r: r[col] in vs)
        return self

    def execute(self):
        return type("R", (), {"data": self.t.run(self)})()


class FakeTable:
    def __init__(self, keys, lossy=None, drop_one_upsert=False, fail_select=False):
        self.keys, self.rows, self.next_id = keys, [], 0
        self.lossy = lossy or {}          # 열 → DB 가 저장하며 값을 바꾸는 함수(float4 반올림 같은)
        self.drop_one_upsert = drop_one_upsert
        self.fail_select = fail_select
        self.upserted = 0
        self.deleted = 0

    def table(self, name):
        return self

    def upsert(self, batch, on_conflict):
        return _Q(self, "upsert", batch, on_conflict)

    def delete(self):
        return _Q(self, "delete")

    def select(self, cols):
        return _Q(self, "select").select(cols)

    def run(self, q):
        if q.op == "select":
            if self.fail_select:
                raise RuntimeError("읽기 실패")
            rows = sorted((r for r in self.rows if all(f(r) for f in q.filters)), key=lambda r: r["id"])
            rows = rows[: q.lim] if q.lim else rows
            return [json.loads(json.dumps({c: r.get(c) for c in q.cols})) for r in rows]
        if q.op == "upsert":
            keys = q.on_conflict.split(",")
            batch = q.payload[:-1] if self.drop_one_upsert and len(q.payload) > 1 else q.payload
            self.drop_one_upsert = False  # 한 번만 흘린다
            for new in batch:
                new = {c: (self.lossy[c](v) if c in self.lossy else v) for c, v in json.loads(json.dumps(new)).items()}
                old = next((r for r in self.rows if all(r[k] == new[k] for k in keys)), None)
                if old:
                    old.update(new)
                else:
                    self.next_id += 1
                    self.rows.append({"id": f"{self.next_id:08d}", **new})
                self.upserted += 1
            return q.payload
        if q.op == "delete":
            gone = [r for r in self.rows if all(f(r) for f in q.filters)]
            self.rows = [r for r in self.rows if r not in gone]
            self.deleted += len(gone)
            return gone
        raise AssertionError(q.op)

    def view(self):
        return sorted(({k: v for k, v in r.items() if k not in ("id", "created_at")} for r in self.rows), key=lambda r: json.dumps(r, sort_keys=True))


def _rows(n, *, bump=None, extra=None, drop=None):
    out = [{"date": f"2026-10-{1 + i % 9:02d}", "code": f"{i:06d}", "count": i, "score": i / 3} for i in range(n)]
    if bump is not None:
        out[bump] = {**out[bump], "count": out[bump]["count"] + 100}
    if drop is not None:
        out.pop(drop)
    if extra:
        out += extra
    return out


def _sorted(rows):
    return sorted((json.loads(json.dumps(r)) for r in rows), key=lambda r: json.dumps(r, sort_keys=True))


@pytest.fixture(autouse=True)
def _small_threshold(monkeypatch):
    monkeypatch.setattr(SC, "DIFF_MIN_ROWS", 10)
    monkeypatch.setattr(SC, "PAGE_SIZE", 7)  # 키셋 페이지를 여러 장 넘기게
    monkeypatch.setenv("REPLACE_ROWS_MODE", "diff")


def test_writes_only_new_and_changed_and_deletes_gone(capsys):
    db = FakeTable(["date", "code"])
    SC.replace_rows(db, "t", _rows(30), "date,code")
    stamps = {r["code"]: r["created_at"] for r in db.rows}
    db.upserted = db.deleted = 0

    new = _rows(30, bump=3, drop=10, extra=[{"date": "2026-10-09", "code": "999999", "count": 1, "score": 0.5}])
    SC.replace_rows(db, "t", new, "date,code")
    assert db.upserted == 2 and db.deleted == 1  # 바뀐 1 + 새 1 · 없어진 1
    assert db.view() == _sorted(new)
    # 안 바뀐 행은 시각도 그대로
    assert all(r["created_at"] == stamps[r["code"]] for r in db.rows if r["code"] not in ("000003", "999999"))
    out = capsys.readouterr().out
    assert "새 1 · 바뀜 1 · 지움 1 · 그대로 28" in out and "확인 같음" in out


def test_verification_catches_a_lost_write_and_rewrites_all(capsys):
    db = FakeTable(["date", "code"])
    SC.replace_rows(db, "t", _rows(30), "date,code")
    db.drop_one_upsert = True  # 쓰기 한 묶음에서 한 행이 조용히 빠진다
    new = _rows(30, bump=3, extra=[{"date": "2026-10-09", "code": "999999", "count": 1, "score": 0.5}])
    SC.replace_rows(db, "t", new, "date,code")
    assert db.view() == _sorted(new)
    assert "예전 방식으로 전부 다시 씁니다" in capsys.readouterr().out


def test_lossy_column_errs_toward_writing_never_toward_stale():
    # DB 가 값을 바꿔 저장하는 열(float4 반올림 같은)은 매번 '바뀜'으로 잡혀 더 쓸 뿐, 옛 값이 남지는 않는다.
    db = FakeTable(["date", "code"], lossy={"score": lambda v: round(v, 2)})
    SC.replace_rows(db, "t", _rows(20), "date,code")
    db.upserted = 0
    SC.replace_rows(db, "t", _rows(20), "date,code")
    assert db.upserted >= 13  # 1/3 같은 값은 반올림돼 늘 다르다
    assert [r["count"] for r in sorted(db.rows, key=lambda r: r["code"])] == list(range(20))


def test_unchanged_run_writes_nothing():
    db = FakeTable(["date", "code"])
    SC.replace_rows(db, "t", _rows(25), "date,code")
    db.upserted = db.deleted = 0
    SC.replace_rows(db, "t", _rows(25), "date,code")
    assert (db.upserted, db.deleted) == (0, 0)


def test_check_mode_writes_nothing(monkeypatch, capsys):
    db = FakeTable(["date", "code"])
    SC.replace_rows(db, "t", _rows(20), "date,code")
    before = json.dumps(db.rows)
    monkeypatch.setenv("REPLACE_ROWS_MODE", "check")
    SC.replace_rows(db, "t", _rows(20, bump=1), "date,code")
    assert json.dumps(db.rows) == before
    assert "[확인 모드] t 계산 20행 · 새 0 · 바뀜 1" in capsys.readouterr().out


def test_full_switch_and_small_tables_use_old_path(monkeypatch):
    db = FakeTable(["date", "code"])
    SC.replace_rows(db, "t", _rows(20), "date,code")
    db.upserted = 0
    monkeypatch.setenv("REPLACE_ROWS_MODE", "full")
    SC.replace_rows(db, "t", _rows(20), "date,code")
    assert db.upserted == 20
    monkeypatch.setenv("REPLACE_ROWS_MODE", "diff")
    db.upserted = 0
    SC.replace_rows(db, "t", _rows(20)[:5], "date,code")  # 문턱(10) 아래 — 예전 방식
    assert db.upserted == 5 and len(db.rows) == 5


def test_read_failure_falls_back_to_old_path(capsys):
    db = FakeTable(["date", "code"])
    SC.replace_rows(db, "t", _rows(20), "date,code")
    db.fail_select = True
    SC.replace_rows(db, "t", _rows(20, bump=2), "date,code")
    assert db.view() == _sorted(_rows(20, bump=2))
    assert "바뀐 행만 쓰기가 실패해 예전 방식으로" in capsys.readouterr().out


def test_where_scope_leaves_other_rows_alone():
    db = FakeTable(["date", "code"])
    SC.replace_rows(db, "t", _rows(30), "date,code")
    scope = [r for r in _rows(30) if r["date"] == "2026-10-02"]
    others = [r for r in _rows(30) if r["date"] != "2026-10-02"]
    new_scope = [{**scope[0], "count": -1}] + scope[2:] + [{"date": "2026-10-02", "code": "888888", "count": 7, "score": 1.0}] * 1
    rows = new_scope + [{"date": "2026-10-02", "code": f"77{i:04d}", "count": i, "score": 0.0} for i in range(10)]
    SC.replace_rows(db, "t", rows, "date,code", where={"date": "2026-10-02"})
    assert db.view() == _sorted(others + rows)


def test_mode_by_weekday(monkeypatch):
    monkeypatch.delenv("REPLACE_ROWS_MODE")
    assert SC.replace_mode(datetime(2026, 10, 11, 6, 40, tzinfo=KST)) == "full"   # 일 아침
    assert SC.replace_mode(datetime(2026, 10, 11, 17, 40, tzinfo=KST)) == "diff"  # 일 저녁
    assert SC.replace_mode(datetime(2026, 10, 10, 6, 40, tzinfo=KST)) == "diff"   # 토 아침(첫 실행)
    monkeypatch.setenv("REPLACE_ROWS_MODE", "FULL")
    assert SC.replace_mode(datetime(2026, 10, 9, 6, 40, tzinfo=KST)) == "full"
