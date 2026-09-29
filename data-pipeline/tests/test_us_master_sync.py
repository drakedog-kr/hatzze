"""미장 종목 마스터 동기화(extract_telegram_us_stocks.sync_master)가 us_stocks 를 못 읽은 날 영문명을 안 지우는지.

기존 이름을 못 읽으면 병합할 수 없으니 name_en 을 어느 행에도 싣지 말아야 한다. 예전엔 그날 전 종목을
'빈 칸'으로 보고 SEC 를 불렀고, SEC 까지 실패하면 name_en=None 을 실어 저장된 영문명 전부를 null 로
덮었다("tesla" 로 테슬라가 안 찾아졌다). 로그는 '영문명은 이번에 건드리지 않습니다'라고 적고 있었다.
"""
import httpx

import common.supabase_client as sc
import extract_telegram_us_stocks as us
from config.us_stock_extraction import primary_names


class _Res:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, db):
        self.db, self.op = db, None

    def select(self, _cols):
        self.op = "select"
        return self

    def upsert(self, rows, on_conflict=""):
        assert on_conflict == "ticker"
        self.op = "upsert"
        self.db.upserted += rows
        return self

    def execute(self):
        if self.op == "select":
            self.db.reads += 1
            if self.db.read_fails(self.db.reads):
                raise httpx.RemoteProtocolError("<ConnectionTerminated error_code:0>")
            return _Res(self.db.stored)
        return _Res([])


class _DB:
    def __init__(self, stored, read_fails=lambda n: False):
        self.stored, self.read_fails = stored, read_fails
        self.reads, self.upserted = 0, []

    def table(self, name):
        assert name == "us_stocks"
        return _Q(self)


def _stored_all():
    return [{"ticker": tk, "name_en": f"{tk} Inc."} for tk in primary_names()]


def _sync(monkeypatch, db, sec=None):
    calls = []
    monkeypatch.setattr(sc.time, "sleep", lambda _s: None)
    monkeypatch.setattr(us, "fetch_sec_names", lambda need: calls.append(set(need)) or dict(sec or {}))
    us.sync_master(db, dry_run=False)
    return calls


def test_failed_read_does_not_touch_english_names(monkeypatch):
    # 읽기가 끝내 끊기고 SEC 도 빈손이다(fetch_sec_names 는 어떤 실패든 {} 를 준다).
    db = _DB(_stored_all(), read_fails=lambda n: True)
    _sync(monkeypatch, db)
    assert {r["ticker"] for r in db.upserted} == set(primary_names())  # 한글명 동기화는 그대로 한다
    # postgrest-py 는 행 키의 합집합을 열 목록으로 보낸다. 한 행이라도 name_en 을 실으면 나머지가 null 이 된다.
    assert not any("name_en" in r for r in db.upserted)


def test_a_dropped_read_is_sent_again(monkeypatch):
    db = _DB(_stored_all(), read_fails=lambda n: n == 1)
    calls = _sync(monkeypatch, db)
    assert calls == []  # 다 채워져 있으니 SEC 를 안 부른다
    assert all(r["name_en"] == f"{r['ticker']} Inc." for r in db.upserted)


def test_normal_run_merges_stored_and_fetched_names(monkeypatch):
    names = sorted(primary_names())
    stored = [{"ticker": tk, "name_en": f"{tk} Inc."} for tk in names[1:]]
    db = _DB(stored)
    calls = _sync(monkeypatch, db, sec={names[0]: "Fetched Corp"})
    assert calls == [{names[0]}]
    got = {r["ticker"]: r["name_en"] for r in db.upserted}
    assert got[names[0]] == "Fetched Corp" and got[names[1]] == f"{names[1]} Inc."
