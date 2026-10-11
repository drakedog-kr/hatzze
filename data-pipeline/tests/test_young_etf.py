"""상장 1년 미만 ETF 의 1년치 어림(common/young_etf.py · fetch_etf_dividends.main).

QNDX(2026-06-23 상장, 분기)가 한 건으로 0.11%, 같은 지수 QQQM 0.43% 로 섰다(2026-10-11). 상장일로 신규를 가르고 남은 차례를
채운다. 지급 기록으로 가르면 연 1회에서 분기로 바꾼 오래된 KODEX 업종 ETF 가 신규로 잡힌다 — 그 경우를 아래에서 막는다.
"""
import sys
from datetime import date

import pytest

import fetch_etf_dividends as etf
from common.stockanalysis import parse_stats
from common.young_etf import estimate, listed_within_year, per_year_from_gaps

TODAY = date(2026, 10, 11)


# ── 셈 ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "pays, want",
    [
        (["2026-08-04", "2026-09-02", "2026-10-02"], 12),
        (["2026-02-03", "2026-05-06", "2026-08-04"], 4),
        (["2026-09-21", "2026-09-28", "2026-10-05"], 52),
        (["2026-03-04", "2026-09-30"], 2),
        (["2026-09-23"], None),
    ],
)
def test_per_year_from_gaps(pays, want):
    assert per_year_from_gaps(pays) == want


def test_listed_within_year():
    assert listed_within_year("2026-06-23", TODAY)
    assert not listed_within_year("2011-10-20", TODAY)
    assert not listed_within_year("2025-10-11", TODAY)  # 딱 365일 전은 1년이 찼다
    assert not listed_within_year(None, TODAY)
    assert not listed_within_year("n/a", TODAY)


def test_qndx_single_quarterly_payment_fills_three_quarters():
    total, rest = estimate([("2026-09-23", 0.02723)], 4, TODAY)
    assert total == pytest.approx(0.10892)
    assert rest == [("2026-12-23", 0.02723), ("2027-03-23", 0.02723), ("2027-06-23", 0.02723)]


def test_rising_monthly_fills_with_mean_not_last():
    # DAISHIN 오피스리츠플러스 꼴 — 마지막 50원으로 채우면 받은 기록보다 부푼다.
    paid = [("2026-05-06", 10), ("2026-06-02", 10), ("2026-07-02", 10), ("2026-08-04", 20), ("2026-09-02", 40), ("2026-10-02", 50)]
    total, rest = estimate(paid, 12, TODAY)
    assert len(rest) == 6 and rest[0][1] == pytest.approx(140 / 6)
    assert total == pytest.approx(280)


def test_falling_monthly_fills_with_last():
    total, rest = estimate([("2026-08-04", 100), ("2026-09-02", 90), ("2026-10-02", 80)], 12, TODAY)
    assert {a for _, a in rest} == {80}
    assert total == pytest.approx(270 + 9 * 80)
    assert rest[0][0] == "2026-11-02" and rest[-1][0] == "2027-07-02"


def test_month_end_clamps():
    _, rest = estimate([("2026-08-31", 10), ("2026-09-30", 10)], 12, date(2026, 10, 5))
    assert [d for d, _ in rest[:5]] == ["2026-10-30", "2026-11-30", "2026-12-30", "2027-01-30", "2027-02-28"]
    _, rest = estimate([("2026-08-31", 10)], 4, date(2026, 10, 5))
    assert [d for d, _ in rest] == ["2026-11-30", "2027-02-28", "2027-05-31"]


def test_weekly_steps_by_seven_days():
    total, rest = estimate([("2026-09-28", 1.0), ("2026-10-05", 1.0)], 52, TODAY)
    assert len(rest) == 50 and rest[0][0] == "2026-10-12" and rest[1][0] == "2026-10-19"
    assert total == pytest.approx(52)


@pytest.mark.parametrize(
    "paid, per_year",
    [
        ([(f"2025-{m:02d}-02", 10) for m in range(11, 13)] + [(f"2026-{m:02d}-02", 10) for m in range(1, 11)], 12),  # 이미 열두 번
        ([("2026-05-04", 10), ("2026-06-02", 10)], 12),  # 넉 달 넘게 끊겼다
        ([("2026-09-23", 0.02723)], None),  # 주기를 모른다
        ([], 4),
    ],
)
def test_no_estimate(paid, per_year):
    assert estimate(paid, per_year, TODAY) is None


def test_parse_stats_reads_inception():
    page = '<div>Payout Frequency <div>n/a</div></div><script>{info:{ticker:"QNDX",inception:"2026-06-23"}}</script>'
    assert parse_stats(page)["inception"] == "2026-06-23"
    assert parse_stats("<div>Payout Ratio 63.71%</div>")["inception"] is None


# ── main() 한 바퀴 ───────────────────────────────────────────────────


class _Q:
    def __init__(self, db):
        self.db, self.op, self.filters = db, None, {}

    def upsert(self, rows, on_conflict=None):
        self.db.upserted.extend(rows)
        return self

    def select(self, _cols):
        self.op = "select"
        return self

    def eq(self, col, value):
        self.filters[col] = value
        return self

    def delete(self):
        self.op = "delete"
        return self

    def in_(self, _col, codes):
        return self

    def execute(self):
        self.data = []
        if self.op == "select" and self.filters.get("estimated") is True:
            self.data = [{"code": c} for c in self.db.estimated]
        return self


class _DB:
    def __init__(self, estimated=()):
        self.upserted, self.estimated = [], list(estimated)

    def table(self, _name):
        return _Q(self)


def _rec(code, pay, amount, record=None):
    return {"code": code, "name": f"ETF {code}", "record": record or pay, "pay": pay, "amount": amount, "kind": "이익분배", "issuer": "운용사"}


# 신규 월분배(KODEX 200커버드콜액티브 꼴) · 2026년에 분기로 바꾼 오래된 업종 ETF(KODEX 자동차 꼴) · 또 하나의 신규.
SEIBRO = [
    _rec("0219E0", "2026-08-04", 153, "2026-07-31"), _rec("0219E0", "2026-09-02", 167, "2026-08-29"), _rec("0219E0", "2026-10-02", 175, "2026-09-30"),
    _rec("091180", "2026-05-06", 400), _rec("091180", "2026-08-04", 313),
    _rec("0223A0", "2026-09-02", 219), _rec("0223A0", "2026-10-02", 235),
]
NOW = {c: {"ISU_CD": c, "TDD_CLSPRC": "8000"} for c in ("0219E0", "091180", "0223A0")}
YEAR_AGO = {c: {"ISU_CD": c} for c in ["091180", *(f"{i:06d}" for i in range(600))]}


def _run(monkeypatch, year_ago, db, taxable=None, us=None, pages=None):
    monkeypatch.setattr(sys, "argv", ["fetch_etf_dividends.py"])
    monkeypatch.setattr(etf, "today_kst", lambda: TODAY)
    monkeypatch.setattr(etf, "krx_latest", lambda start=None: ("2026-10-08", NOW) if start is None else (year_ago and ("2025-10-10", year_ago)))
    monkeypatch.setattr(etf, "seibro_history", lambda today: SEIBRO)
    monkeypatch.setattr(etf, "get_client", lambda: db)
    monkeypatch.setattr(etf, "load_last_quotes", lambda db, table, key: {})
    monkeypatch.setattr(etf, "tiger_taxable", lambda today: taxable or {})
    monkeypatch.setattr(etf, "stored_taxable", lambda db: {})
    monkeypatch.setattr(etf, "usdkrw", lambda: None)
    monkeypatch.setattr(etf, "FINNHUB_API_KEY", None)
    monkeypatch.setattr(etf, "US_ETFS", us or [])
    monkeypatch.setattr(etf, "dividend_page", lambda code, kind: (pages or {})[code])
    etf.main()
    return {r["code"]: r for r in db.upserted}


def test_kr_young_by_listing_not_by_history(monkeypatch):
    rows = _run(monkeypatch, YEAR_AGO, _DB(), taxable={("0219E0", "2026-09-30"): 0.0})
    young = rows["0219E0"]
    assert young["estimated"] and young["cadence"] == "월"
    assert young["ttm_dps"] == 495 + 9 * 165  # 마지막 175 보다 평균 165 가 작다
    assert young["ttm_yield_pct"] == round(1980 / 8000 * 100, 3)
    assert [p["pay"] for p in young["payments"] if p.get("est")][:2] == ["2026-11-02", "2026-12-02"]
    assert sum(p["amount"] for p in young["payments"]) == pytest.approx(young["ttm_dps"])
    assert young["pay_months"] == [8, 9, 10]  # 표의 지급 달은 받은 건만
    # 과표는 받은 건의 비율(175 중 0 → 495 중 320)을 1년치에 옮긴다.
    assert young["taxable_dps"] == round(320 * 1980 / 495, 2)
    # 1년 전에도 있던 ETF 는 지급 기록이 짧아도 어림하지 않는다.
    old = rows["091180"]
    assert not old["estimated"] and old["ttm_dps"] == 713 and not any(p.get("est") for p in old["payments"])
    assert rows["0223A0"]["estimated"]


def test_kr_year_ago_list_missing_keeps_yesterdays_verdict(monkeypatch):
    rows = _run(monkeypatch, None, _DB(estimated=["0219E0"]))
    assert rows["0219E0"]["estimated"]
    assert not rows["0223A0"]["estimated"] and rows["0223A0"]["ttm_dps"] == 454
    assert not rows["091180"]["estimated"]


def test_kr_year_ago_list_half_empty_is_not_trusted(monkeypatch):
    rows = _run(monkeypatch, {"091180": {}}, _DB())
    assert not any(r["estimated"] for r in rows.values())


def test_us_young_by_inception(monkeypatch):
    us = [{"code": c, "name_ko": c, "name_en": c, "cadence": "분기", "source": "x"} for c in ("QNDX", "SCHD")]
    pages = {
        "QNDX": ([{"ex": "2026-09-21", "record": "2026-09-21", "pay": "2026-09-23", "amount": 0.02723}], {"inception": "2026-06-23"}),
        "SCHD": ([{"ex": "2026-06-24", "record": "2026-06-24", "pay": "2026-06-29", "amount": 0.2525}], {"inception": "2011-10-20"}),
    }
    rows = _run(monkeypatch, YEAR_AGO, _DB(), us=us, pages=pages)
    assert rows["QNDX"]["estimated"] and rows["QNDX"]["ttm_dps"] == round(0.02723 * 4, 4)
    assert [p["pay"] for p in rows["QNDX"]["payments"]] == ["2026-09-23", "2026-12-23", "2027-03-23", "2027-06-23"]
    assert not rows["SCHD"]["estimated"] and rows["SCHD"]["ttm_dps"] == 0.2525
