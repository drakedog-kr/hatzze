"""과열도 소급(backfill_scores --apply)이 calculate_score 와 같은 값을 쓰는지 — 두 벌 공식이 갈라지지 않게.

2026-07-23 에 calculate_score 가 괴리 지수의 max(0, lead) 를 걷어내고 거래대금에 250일 백분위(level_pct)를
섞기 시작했는데, backfill 만 옛 공식에 남아 --apply 가 최신 행까지 다른 과열도로 덮어썼다.
"""
import backfill_scores as bf
import calculate_score as cs


def divergence(monkeypatch, ccsi, gap):
    rows = {
        "ccsi": [{"date": "2026-09-01", "raw_value": ccsi, "details": None}],
        "gap": [{"date": "2026-09-29", "raw_value": gap, "details": None}],
    }
    monkeypatch.setattr(bf, "load_series", lambda client, iid: rows[iid])
    out = bf.divergence_by_date(None, {cs.CCSI_SLUG: "ccsi", "kospi_high_gap": "gap"})
    return round(out["2026-09-29"], 2)


def test_real_leading_reads_cold_not_zero(monkeypatch):
    # CCSI 110(실물 84%ile) · 낙폭 −20%(증시 31%ile) → lead −52.85. 라이브는 18.46, 옛 공식은 0.
    assert divergence(monkeypatch, 110.0, -20.0) == 18.46


def test_market_leading_is_hot_like_live(monkeypatch):
    # CCSI 100 · 낙폭 −10% → lead +23.40. 라이브는 82.0(초고온 배지), 옛 공식은 23.4.
    assert divergence(monkeypatch, 100.0, -10.0) == 82.0
    assert cs.lead_progress(23.397) >= cs.HOT_ZONE


def surge(**details):
    rows = [{"date": "2026-09-29", "raw_value": 300_000.0, "details": details}]
    return {d: round(p, 2) for d, p in bf.progress_by_date("kospi_volume_surge", rows).items()}


def test_volume_surge_blends_level_like_live():
    # 급증률 +10%(눈금 46.43) · 250일 백분위 90 → 0.7×46.43 + 0.3×90 = 59.5. 옛 소급은 46.43.
    assert surge(surge_pct=10.0, level_pct=90.0) == {"2026-09-29": 59.5}
    # 급증률 눈금은 섞기 전에 100 으로 자른다(+120% → 125 → 100): 0.7×100 + 0.3×50.
    assert surge(surge_pct=120.0, level_pct=50.0) == {"2026-09-29": 85.0}


def test_volume_surge_without_level_or_details():
    assert surge(surge_pct=10.0) == {"2026-09-29": 46.43}  # 250일이 안 쌓인 날은 급증률만
    assert surge() == {}  # fetch 가 세부값을 안 남긴 날짜는 뺀다
