"""TIGER 과표를 못 받은 날 저장된 값을 이어 쓰는지(fetch_etf_dividends.stored_taxable)."""
import fetch_etf_dividends as etf


def test_reads_kr_payment_taxables(monkeypatch):
    rows = [
        {"code": "472150", "market": "KR", "payments": [
            {"record": "2026-08-29", "amount": 88, "taxable": 5},
            {"record": "2026-07-31", "amount": 90},  # 과표 없는 건은 건너뛴다
            {"record": "2026-06-30", "amount": 85, "taxable": 0},  # 0 은 '전액 비과세'라 살려야 한다
        ]},
        {"code": "JEPI", "market": "US", "payments": [{"pay": "2026-09-05", "amount": 0.4, "taxable": 1}]},
        {"code": "069500", "market": "KR", "payments": None},
    ]
    monkeypatch.setattr(etf, "load_all", lambda db, table, cols, order_by="id": rows)
    assert etf.stored_taxable(object()) == {("472150", "2026-08-29"): 5.0, ("472150", "2026-06-30"): 0.0}


def test_read_failure_is_empty(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("57014")

    monkeypatch.setattr(etf, "load_all", boom)
    assert etf.stored_taxable(object()) == {}
