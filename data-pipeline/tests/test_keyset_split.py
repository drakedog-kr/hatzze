"""common/supabase_client.load_keyset 의 나눠 읽기 — 차례로 읽은 것과 행도 순서도 같아야 한다.

메모리 위 가짜 표로 PostgREST 의 select · order · limit · gt · gte · lt · eq 만 흉내 낸다. 가짜 표는 진짜
클라이언트가 아니라 갈래들이 같은 객체를 나눠 쓴다(읽기만 하므로 안전하다).
"""
import random
import threading
import uuid

import pytest

import common.supabase_client as SC


class _Q:
    def __init__(self, t):
        self.t, self.filters, self.cols, self.lim, self.ops, self.args = t, [], None, None, [], []

    def select(self, cols):
        self.cols = [c.strip() for c in cols.split(",")]
        return self

    def order(self, key):
        self.key = key
        return self

    def limit(self, n):
        self.lim = n
        return self

    def _where(self, op, col, v, test):
        self.ops.append(op)
        self.args.append((op, col, v))
        self.filters.append(lambda r: test(r[col], v))
        return self

    def gt(self, col, v):
        return self._where("gt", col, v, lambda a, b: a > b)

    def gte(self, col, v):
        return self._where("gte", col, v, lambda a, b: a >= b)

    def lt(self, col, v):
        return self._where("lt", col, v, lambda a, b: a < b)

    def eq(self, col, v):
        return self._where("eq", col, v, lambda a, b: a == b)

    def execute(self):
        return type("R", (), {"data": self.t.run(self)})()


class FakeTable:
    def __init__(self, rows, fail_when=None):
        self.rows = rows
        self.fail_when = fail_when  # 질의를 받아 True 면 그 요청을 실패시킨다
        self.queries: list[_Q] = []
        self.threads: set[int] = set()
        self._lock = threading.Lock()

    def table(self, name):
        return self

    def select(self, cols):
        return _Q(self).select(cols)

    def run(self, q):
        with self._lock:
            self.queries.append(q)
            self.threads.add(threading.get_ident())
        if self.fail_when and self.fail_when(q):
            raise RuntimeError("읽기 실패")
        rows = sorted((r for r in self.rows if all(f(r) for f in q.filters)), key=lambda r: r[q.key])
        return [{c: r.get(c) for c in q.cols} for r in rows[: q.lim]]

    def ranged(self) -> int:
        """구간 조건(gte · lt)이 붙은 요청 수 — 나눠 읽었으면 0 보다 크다."""
        return sum(1 for q in self.queries if "lt" in q.ops or "gte" in q.ops)


def _uuid_rows(n: int, seed: int = 1) -> list[dict]:
    rng = random.Random(seed)
    return [{"id": str(uuid.UUID(int=rng.getrandbits(128))), "v": i, "kind": "a" if i % 3 else "b"} for i in range(n)]


@pytest.fixture(autouse=True)
def _small_pages(monkeypatch):
    monkeypatch.setattr(SC, "PAGE_SIZE", 50)
    monkeypatch.delenv("KEYSET_WORKERS", raising=False)


def _sequential(rows: list[dict], cols: list[str]) -> list[dict]:
    return [{c: r.get(c) for c in cols} for r in sorted(rows, key=lambda r: r["id"])]


def test_split_read_returns_the_same_rows_in_the_same_order():
    rows = _uuid_rows(5000)
    t = FakeTable(rows)
    got = SC.load_keyset(t, "x", "id,v")
    assert got == _sequential(rows, ["id", "v"])
    assert t.ranged() > 0
    assert len(t.threads) > 1  # 정말 여러 갈래가 읽었다


def test_load_all_keyset_and_replace_scope_take_the_split_path():
    rows = _uuid_rows(1200, seed=2)
    t = FakeTable(rows)
    assert SC.load_all_keyset(t, "x", "id,v") == _sequential(rows, ["id", "v"])
    assert t.ranged() > 0
    t2 = FakeTable(rows)
    assert SC._load_scope(t2, "x", ["v"], None) == _sequential(rows, ["id", "v"])
    assert t2.ranged() > 0


def test_workers_one_reads_in_order_like_before(monkeypatch):
    monkeypatch.setenv("KEYSET_WORKERS", "1")
    rows = _uuid_rows(700, seed=3)
    t = FakeTable(rows)
    assert SC.load_keyset(t, "x", "id,v") == _sequential(rows, ["id", "v"])
    assert t.ranged() == 0
    assert len(t.queries) == 15  # 50행 14장 + 빈 장을 확인하는 마지막 한 번


def test_narrow_keeps_the_sequential_path():
    rows = _uuid_rows(900, seed=4)
    t = FakeTable(rows)
    got = SC.load_keyset(t, "x", "id,v,kind", narrow=lambda q: q.eq("kind", "b"))
    assert got == _sequential([r for r in rows if r["kind"] == "b"], ["id", "v", "kind"])
    assert t.ranged() == 0
    t2 = FakeTable(rows)
    assert SC._load_scope(t2, "x", ["v"], {"kind": "b"}) == _sequential([r for r in rows if r["kind"] == "b"], ["id", "v"])
    assert t2.ranged() == 0


def test_non_uuid_keys_keep_the_sequential_path():
    rows = [{"id": f"{i:08d}", "v": i} for i in range(400)]
    t = FakeTable(rows)
    assert SC.load_keyset(t, "x", "id,v") == _sequential(rows, ["id", "v"])
    assert t.ranged() == 0


def test_one_page_table_makes_a_single_request():
    rows = _uuid_rows(30, seed=5)
    t = FakeTable(rows)
    assert SC.load_keyset(t, "x", "id,v") == _sequential(rows, ["id", "v"])
    assert len(t.queries) == 1


def test_skewed_keys_and_keys_on_the_cut_lines_are_all_read_once():
    rng = random.Random(6)
    skewed = [{"id": "a" + str(uuid.UUID(int=rng.getrandbits(128)))[1:], "v": i} for i in range(600)]
    on_cuts = [{"id": cut, "v": -1} for cut in SC._UUID_CUTS]
    edges = [{"id": "00000000-0000-0000-0000-000000000000", "v": -2}, {"id": "ffffffff-ffff-ffff-ffff-ffffffffffff", "v": -3}]
    rows = skewed + on_cuts + edges
    t = FakeTable(rows)
    got = SC.load_keyset(t, "x", "id,v")
    assert got == _sequential(rows, ["id", "v"])
    assert len({r["id"] for r in got}) == len(rows)


def test_ranges_cover_every_key_without_overlap():
    assert SC.UUID_RANGES[0][0] is None and SC.UUID_RANGES[-1][1] is None
    assert len(SC.UUID_RANGES) == 16
    for (_lo, hi), (lo2, _hi2) in zip(SC.UUID_RANGES, SC.UUID_RANGES[1:]):
        assert hi == lo2  # 앞 구간의 위가 곧 다음 구간의 아래다
    cuts = [hi for _lo, hi in SC.UUID_RANGES[:-1]]
    assert cuts == sorted(cuts) and all(SC.UUID_RE.match(c) for c in cuts)


def test_a_failing_range_raises_instead_of_returning_part_of_the_table():
    rows = _uuid_rows(2000, seed=7)
    # c 로 시작하는 구간의 첫 요청만 실패시킨다. 나머지 열다섯 구간은 멀쩡히 읽힌다.
    t = FakeTable(rows, fail_when=lambda q: ("gte", "id", "c0000000-0000-0000-0000-000000000000") in q.args)
    with pytest.raises(RuntimeError):
        SC.load_keyset(t, "x", "id,v")
    assert t.ranged() > 1


@pytest.mark.parametrize("raw,want", [(None, 8), ("", 8), ("4", 4), ("1", 1), ("0", 1), ("-3", 1), ("99", 16), ("여덟", 8)])
def test_keyset_workers_reads_the_env(monkeypatch, raw, want):
    if raw is None:
        monkeypatch.delenv("KEYSET_WORKERS", raising=False)
    else:
        monkeypatch.setenv("KEYSET_WORKERS", raw)
    assert SC.keyset_workers() == want
