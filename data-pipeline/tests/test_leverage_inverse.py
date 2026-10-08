"""레버리지 대 인버스 — 대표지수만 고르는가(split)와 20영업일 합의 비율(build_rows)."""

from scripts.fetch_leverage_inverse import MIN_BASE_DAYS, WINDOW, build_rows, split


def _x(name, idx, val):
    return {"ISU_NM": name, "IDX_IND_NM": idx, "ACC_TRDVAL": str(val)}


def test_split_keeps_only_flagship_indexes():
    rows = [
        _x("KODEX 레버리지", "코스피 200", 300),
        _x("KODEX 200선물인버스2X", "코스피 200 선물지수", 100),
        _x("KODEX 코스닥150레버리지", "코스닥 150", 50),
        _x("1Q 삼성전자선물단일종목레버리지", "삼성전자 선물", 999),  # 단일종목은 뺀다
        _x("KODEX 미국나스닥100레버리지", "NASDAQ 100", 999),  # 해외 지수도 뺀다
        _x("KODEX 200", "코스피 200", 999),  # 레버리지·인버스가 아니다
    ]
    assert split(rows) == (350.0, 100.0)


def test_compares_with_usual_ratio():
    # 평소 비율 1(레버리지 = 인버스)로 MIN_BASE_DAYS+WINDOW 일 → 마지막 WINDOW 일은 레버리지가 두 배
    n = WINDOW + MIN_BASE_DAYS
    days = {f"d{i:04d}": (1e12, 1e12) for i in range(n)}
    days.update({f"d{i:04d}": (2e12, 1e12) for i in range(n, n + WINDOW)})
    rows = build_rows(days)
    last = rows[-1]
    assert last["details"]["ratio"] == 2.0 and last["details"]["base"] == 1.0
    assert last["raw_value"] == 2.0
    assert (last["details"]["lev_base_jo"], last["details"]["inv_base_jo"]) == (20.0, 20.0)  # 앞 1년 20일 합의 중앙값(조)
    # 평소가 MIN_BASE_DAYS 일 안 찬 앞쪽 날은 값을 안 낸다
    assert rows[0]["date"] == f"d{WINDOW - 1 + MIN_BASE_DAYS:04d}"
