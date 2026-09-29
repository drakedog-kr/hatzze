"""미국 ETF 순유입(fetch_seohak_etf)의 '직전 거래일'이 이번 실행에서 받은 날도 될 수 있는지.

표에 없는 거래일(앞 실행의 KRX 실패·수집 중단)을 이번 실행이 받아 오면, 그다음 거래일은 그 날과
견줘야 한다. 예전엔 오늘부터 거꾸로 돌아 방금 받은 날이 늘 더 늦은 날이라 '직전'이 못 됐고,
다음 거래일이 이틀치 설정·환매를 떠안아 그 날 몫이 두 번 셌다. 2026-09 추석 모양 그대로다.
"""
from datetime import date

import fetch_seohak_etf as m

NAV = 10_000.0
CODE = "360750"
NAME = "TIGER 미국S&P500"


class _Res:
    status_code = 200

    def __init__(self, items):
        self.items = items

    def raise_for_status(self):
        pass

    def json(self):
        return {"OutBlock_1": self.items}


def _item(shares, trade_value=1_000_000):
    return {
        "ISU_CD": CODE, "ISU_NM": NAME, "NAV": str(NAV), "LIST_SHRS": str(shares),
        "TDD_CLSPRC": str(NAV), "FLUC_RT": "0", "ACC_TRDVAL": str(trade_value),
        "INVSTASST_NETASST_TOTAMT": "0", "IDX_IND_NM": "S&P 500",
    }


# KRX 가 주는 좌수. 09-24·25 는 추석 휴장(거래대금 0 으로 온다), 09-26·27 은 주말.
KRX = {
    "20260923": [_item(1000)],
    "20260924": [_item(1000, 0)],
    "20260925": [_item(1000, 0)],
    "20260928": [_item(1100)],
    "20260929": [_item(1300)],
}
# 표에는 09-28 이 없다(그날 KRX 가 막혔다).
STORED = [
    {"trade_date": "2026-09-22", "isu_cd": CODE, "list_shares": 900},
    {"trade_date": "2026-09-23", "isu_cd": CODE, "list_shares": 1000},
]


class _Q:
    def __init__(self, db):
        self.db = db

    def select(self, *_a, **_k):
        return self

    def gte(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def upsert(self, rows, **_k):
        self.db.upserted += rows
        return self

    def execute(self):
        class R:
            pass

        r = R()
        r.data = self.db.stored
        return r


class _DB:
    def __init__(self):
        self.stored, self.upserted = STORED, []

    def table(self, _name):
        return _Q(self)


def test_day_fetched_in_this_run_is_the_prior_trading_day(monkeypatch):
    class _Today(date):
        @classmethod
        def today(cls):
            return cls(2026, 9, 29)

    db = _DB()
    monkeypatch.setattr(m, "date", _Today)
    monkeypatch.setattr(m, "get_client", lambda: db)
    monkeypatch.setattr(m, "krx_get", lambda _url, bas_dd: _Res(KRX.get(bas_dd, [])))
    m.main()
    flow = {r["trade_date"]: r["net_flow"] for r in db.upserted}
    assert flow == {
        "2026-09-23": 100 * NAV,  # 09-22 대비
        "2026-09-28": 100 * NAV,  # 09-23 대비(사이는 휴장·주말)
        "2026-09-29": 200 * NAV,  # 방금 받은 09-28 대비 — 09-23 대비 300 이 아니다
    }
