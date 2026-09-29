"""과열도 소급(backfill_scores --apply)이 calculate_score 와 같은 값을 쓰는지 — 두 벌 공식이 갈라지지 않게.

2026-07-23 에 calculate_score 가 괴리 지수의 max(0, lead) 를 걷어냈는데 backfill 만 옛 공식에 남아,
--apply 가 최신 행까지 다른 과열도로 덮어썼다.
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
