"""fetch_krx_price_history — KRX 응답을 표의 행으로 옮기는 자리와 '반쪽 날' 거르기."""

import fetch_krx_price_history as m


class _Resp:
    def __init__(self, rows, status=200):
        self.status_code = status
        self._rows = rows
        self.text = ""

    def json(self):
        return {"OutBlock_1": self._rows}


def test_parse_rows_drops_blank_code_and_close():
    rows = m.parse_rows(
        [
            {"ISU_CD": "005930", "TDD_CLSPRC": "276,000", "FLUC_RT": "-0.19"},
            {"ISU_CD": "", "TDD_CLSPRC": "1,000", "FLUC_RT": "0"},
            # 거래 정지 등으로 종가가 비어 오는 줄 — 0 원 선을 그리면 안 된다.
            {"ISU_CD": "123456", "TDD_CLSPRC": "", "FLUC_RT": ""},
            {"ISU_CD": "654321", "TDD_CLSPRC": "0", "FLUC_RT": "0"},
        ],
        "2026-10-02",
    )
    assert rows == [{"code": "005930", "date": "2026-10-02", "close": 276000, "change_rate": -0.19}]


def test_fetch_day_skips_half_day(monkeypatch):
    # 코스피는 왔는데 코스닥이 비면 그날을 통째로 안 쓴다 — 코스피만 들어가면 그날이 '있는 날'로 세진다.
    answers = iter([_Resp([{"ISU_CD": "005930", "TDD_CLSPRC": "1"}]), _Resp([])])
    monkeypatch.setattr(m, "krx_get", lambda url, d: next(answers))
    assert m.fetch_day("20261002") == []


def test_fetch_day_holiday_asks_kospi_only(monkeypatch):
    calls = []

    def fake(url, d):
        calls.append(url)
        return _Resp([])

    monkeypatch.setattr(m, "krx_get", fake)
    assert m.fetch_day("20261009") == []
    assert calls == [m.KOSPI_URL]


def test_fetch_day_failure_is_none(monkeypatch):
    # 재시도까지 소진(None) · 401 같은 4xx 는 '빈 날'이 아니라 실패 — 호출부가 거기서 멈춘다.
    monkeypatch.setattr(m, "krx_get", lambda url, d: None)
    assert m.fetch_day("20261002") is None
    monkeypatch.setattr(m, "krx_get", lambda url, d: _Resp([], status=401))
    assert m.fetch_day("20261002") is None
