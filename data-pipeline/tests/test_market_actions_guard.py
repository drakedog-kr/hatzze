"""KIND 시장조치 검색(fetch_market_actions)이 한 건도 못 읽었을 때 1년치를 0 으로 덮어쓰지 않는지.

'매매거래중단' 검색엔 개별종목 매매정지(SPAC 합병 등)가 늘 섞여 나온다. 그 검색이 0건이면 조용한 시장이
아니라 페이지를 못 읽은 것이다. 사이드카가 1년 내내 없는 건 있을 수 있는 일이라 그쪽 0건은 통과한다.
"""
from datetime import date

import pytest

import fetch_market_actions as ma


class _Rec:
    def __init__(self):
        self.upserts = []

    def table(self, name):
        rec = self

        class T:
            def upsert(self, rows, on_conflict=None):
                rec.upserts.append(rows)
                return self

            def execute(self):
                return self

        return T()


def run(monkeypatch, db, sidecar, halts):
    answers = {ma.SIDECAR_KEYWORD: sidecar, ma.CIRCUIT_BREAKER_SEARCH_KEYWORD: halts}
    monkeypatch.setattr(ma, "search_market_actions", lambda kwd, frm, to: answers[kwd])
    monkeypatch.setattr(ma, "get_client", lambda: db)
    monkeypatch.setattr(ma, "ensure_indicator", lambda client, meta: "id")
    ma.main()


SPAC_HALT = ("코스닥시장", "매매거래정지 (스팩 합병)", date(2026, 9, 1))


def test_unparsed_page_does_not_zero_the_year(monkeypatch):
    db = _Rec()
    with pytest.raises(RuntimeError):
        run(monkeypatch, db, [], [])
    assert db.upserts == []


def test_quiet_year_without_sidecars_still_writes(monkeypatch):
    db = _Rec()
    run(monkeypatch, db, [], [SPAC_HALT])
    (rows,) = db.upserts
    assert len(rows) == ma.BACKFILL_DAYS + 1
    assert all(r["raw_value"] == 0.0 for r in rows)
