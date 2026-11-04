"""배당 잡 스크립트의 DB 요청은 게이트웨이 5xx 한 번에 죽지 않는다(2026-11-04 #804).

그날 저녁 예탁원 배당 기록 upsert 가 500행씩 144번 중 4번째에 Cloudflare 502 를 받고 스텝째 죽었다.
1,500행만 새 스냅숏으로 바뀌고 나머지는 전날 것으로 남았다. 쓰기가 execute_with_retry 밖에 있었다.
"""
import re
import sys
from pathlib import Path

import pytest
from postgrest.exceptions import APIError

import common.supabase_client as sc
import fetch_kr_dividends as kd

WORKFLOW = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "daily-update.yml"
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _bad_gateway():
    return APIError({"message": "Bad Gateway", "code": "502", "hint": None, "details": "<html>cloudflare</html>"})


class _Query:
    def __init__(self, db, kind, payload=None):
        self.db, self.kind, self.payload = db, kind, payload

    def __getattr__(self, _name):  # lt · limit · order 같은 사슬은 그대로 잇는다
        return lambda *a, **kw: self

    def execute(self):
        if self.db.fail_once.get(self.kind) == len(self.db.calls[self.kind]):
            self.db.fail_once.pop(self.kind)
            raise _bad_gateway()
        self.db.calls[self.kind].append(self.payload)
        return type("R", (), {"data": [], "count": self.db.vanished})()


class _FakeDB:
    """upsert · delete · select 를 받아 적고, fail_once[종류] 번째(0부터) 요청 하나만 502 로 돌려준다."""

    def __init__(self, fail_once, vanished):
        self.fail_once, self.vanished = dict(fail_once), vanished
        self.calls = {"upsert": [], "delete": [], "select": []}

    def table(self, _name):
        db = self

        class _T:
            def upsert(self, rows, **_kw):
                return _Query(db, "upsert", rows)

            def delete(self):
                return _Query(db, "delete")

            def select(self, *_a, **_kw):
                return _Query(db, "select")

        return _T()


def _run(monkeypatch, db, n_rows=8):
    raw = [{"isin": f"KR70059{i:05d}", "record_date": "2026-09-30", "snapshot_date": "2026-11-03"} for i in range(n_rows)]
    monkeypatch.setattr(sc.time, "sleep", lambda _s: None)
    monkeypatch.setattr(kd, "KSD_API_KEY", "x")
    monkeypatch.setattr(kd, "CHUNK", 2)
    monkeypatch.setattr(kd, "VANISH_ABORT_RATIO", 1.0)
    monkeypatch.setattr(kd, "fetch_all", lambda: (raw, n_rows))
    monkeypatch.setattr(kd, "to_row", lambda x: x)
    monkeypatch.setattr(kd, "summarize", lambda rows, listed: None)
    monkeypatch.setattr(kd, "load_all", lambda *a, **kw: [])
    monkeypatch.setattr(kd, "get_client", lambda: db)
    monkeypatch.setattr(sys, "argv", ["fetch_kr_dividends.py"])
    kd.main()


def test_kr_dividend_upsert_survives_one_502(monkeypatch):
    db = _FakeDB(fail_once={"upsert": 3}, vanished=1)  # #804 처럼 네 번째 묶음
    _run(monkeypatch, db)
    assert [len(c) for c in db.calls["upsert"]] == [2, 2, 2, 2]
    assert len(db.calls["delete"]) == 1  # 전량을 다 쓴 뒤에야 사라진 행을 지운다


def test_kr_dividend_delete_survives_one_502(monkeypatch):
    db = _FakeDB(fail_once={"delete": 0}, vanished=1)
    _run(monkeypatch, db)
    assert len(db.calls["delete"]) == 1


def test_kr_dividend_gives_up_before_deleting(monkeypatch):
    # 다시 던져도 계속 502 면 죽는다. 그때도 사라진 행 지우기까지 가지 않는다 — 덜 쓴 표에서 지우면 산 행이 지워진다.
    db = _FakeDB(fail_once={}, vanished=1)
    tries = {"n": 0}

    def always_502(self):
        if self.kind == "upsert" and len(self.db.calls["upsert"]) == 1:
            tries["n"] += 1
            raise _bad_gateway()
        self.db.calls[self.kind].append(self.payload)
        return type("R", (), {"data": [], "count": self.db.vanished})()

    monkeypatch.setattr(_Query, "execute", always_502)
    with pytest.raises(APIError):
        _run(monkeypatch, db)
    assert tries["n"] == sc.TRANSPORT_RETRIES + 1
    assert db.calls["delete"] == []


def _dividend_alert_scripts():
    """'배당주 수집 중단' 이슈가 세는 스크립트 — 워크플로 요약 스텝의 names=(…) 줄."""
    line = next(l for l in WORKFLOW.read_text().splitlines() if "names=(" in l and "fetch_kr_dividends.py" in l)
    return re.findall(r'"([a-z0-9_]+\.py)"', line)


def test_alert_list_is_read():
    names = _dividend_alert_scripts()
    assert {"fetch_kr_dividends.py", "fetch_us_dividends.py", "calculate_kr_dividend_stats.py"} <= set(names)


@pytest.mark.parametrize("name", _dividend_alert_scripts())
def test_dividend_job_scripts_have_no_bare_execute(name):
    src = (SCRIPTS / name).read_text()
    bare = [i + 1 for i, l in enumerate(src.splitlines()) if re.search(r"\.execute\(\)", l)]
    assert not bare, f"{name} {bare}번째 줄 — DB 요청은 execute_with_retry 로 감쌀 것(#804)"
