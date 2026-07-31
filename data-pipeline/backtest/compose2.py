"""전수 검사 3 — 종합점수 단위로 후보 가중치를 견준다 (2026-08-01).

recal2.py 가 지표 하나하나의 성적을 냈다면, 여기는 그걸 합쳤을 때 **지수가**
어떻게 되는지를 본다. 지표 성적이 좋아도 서로 상관이 높으면 합쳐서 안 좋아진다.

calculate_score 와 같은 규칙으로 합친다 — 그날 값이 없는 지표는 분모에서 뺀다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine import CAPPED, INDICATOR_WEIGHTS, kdf, kospi, spearman
from recal2 import PEAKS, TROUGHS, WIN, event_mean, per_event

from scripts.calculate_score import SCORE_DISPLAY_ANCHORS, percentile_from_anchors

IDX = kospi.index


def composite(weights: dict[str, float]) -> pd.Series:
    """calculate_score 규칙 그대로 — 값 없는 지표는 분모에서 제외."""
    mat = pd.DataFrame({s: CAPPED[s].reindex(IDX) for s in weights if s in CAPPED})
    w = pd.Series({s: weights[s] for s in mat.columns})
    num = (mat * w).sum(axis=1, min_count=1)
    den = mat.notna().mul(w, axis=1).sum(axis=1)
    return (num / den.replace(0, np.nan)).dropna()


def displayed(raw: pd.Series) -> pd.Series:
    return raw.map(lambda v: percentile_from_anchors(float(v), SCORE_DISPLAY_ANCHORS))


def scorecard(name: str, weights: dict[str, float]) -> dict:
    raw = composite(weights)
    disp = displayed(raw)
    pk_raw, tr_raw = event_mean(raw, PEAKS), event_mean(raw, TROUGHS)
    pk_d, tr_d = event_mean(disp, PEAKS), event_mean(disp, TROUGHS)
    r_dd, _ = spearman(disp, kdf["fwd_dd"])
    r_gap, _ = spearman(disp, kdf["gap"])
    return dict(
        name=name,
        wsum=sum(weights.values()),
        raw_pk=pk_raw, raw_tr=tr_raw, raw_spread=pk_raw - tr_raw,
        pk=pk_d, tr=tr_d, spread=pk_d - tr_d,
        hot_pct=float((disp >= 75).mean() * 100),
        cold_pct=float((disp <= 25).mean() * 100),
        med=float(disp.median()),
        r_dd=r_dd, r_gap=r_gap,
        peaks=per_event(disp, PEAKS), troughs=per_event(disp, TROUGHS),
    )


# ---------------------------------------------------------------- 후보들
CURRENT = dict(INDICATOR_WEIGHTS)

# 후보 A — 역방향 둘(put_call, upbit)을 점수에서 뺀다.
# 검사 2가 kosdaq_kospi_ratio(−35.0)에 한 것과 같은 처분. 카드는 남기고 가중치만 0.
A = {k: v for k, v in CURRENT.items() if k not in ("put_call_ratio", "upbit_speculation_index")}

# 후보 B — A + 실측 등급에 맞춰 재배정.
# 원칙: (1) p ≤ 0.05 인 A등급을 위로, (2) 스프레드가 커도 p 가 안 나오면 올리지 않는다,
# (3) 표본이 짧아 못 잰 9개는 손대지 않는다(근거 없이 움직이면 그것도 과적합).
B = {
    # A등급 — 스프레드 33~43, p ≤ 0.05
    "kospi_high_gap": 4.0,                 # +43.0 p=0.00
    "kospi_speed_60d": 4.0,                # +42.3 p=0.03  ← 2.5에서 상향
    "naver_search_trend": 3.5,             # +39.6 p=0.02
    "kospi_asia_relative_strength": 3.0,   # +33.1 p=0.05  ← 2.0에서 상향
    # B등급 — 스프레드 25~29
    "foreign_sell_at_high": 2.0,           # +28.8 p=0.13  ← 2.5에서 하향(p 안 나옴)
    "kospi_volume_surge": 3.5,             # +25.4 p=0.19  ← 4.5에서 하향(p 안 나옴)
    "limit_up_breadth": 2.5,               # +25.3 p=0.00  ← 1.0에서 상향(p 최상위)
    # B등급 — 스프레드 10~19
    "buffett_index": 2.0,                  # +18.3, 낙폭상관 −0.64
    "usdkrw_volatility": 1.0,              # +12.0
    "leverage_etf_volume": 1.5,            # +11.0
    "kospi_gold_ratio": 1.0,               # +10.8
    # C등급 — 스프레드 3~10
    "luxury_consumption_index": 0.5,
    "market_actions_30d": 1.5,             # +6.5, 낙폭상관 −0.57
    "vkospi": 1.0,                         # +6.5  ← 1.5에서 하향
    "small_business_crisis_index": 1.0,    # +6.1, 초고온 0%  ← 1.5에서 하향
    "fine_dining_search_index": 0.5,
    # 표본 부족 — 못 쟀으니 현행 유지
    "turnover_concentration": 2.0,
    "dcinside_post_count": 2.0,
    "news_sentiment": 1.5,
    "brokerage_app_rank": 1.5,
    "bestseller_finance_ratio": 1.0,
    "youtube_finance_search_views": 1.0,
    "github_trading_bot_repos": 0.5,
}

# 후보 C — B 에서 '못 잰 9개'의 무게까지 절반으로 줄여 본다(검증된 축에 집중).
C = dict(B)
for k in ("turnover_concentration", "dcinside_post_count", "news_sentiment",
          "brokerage_app_rank", "bestseller_finance_ratio",
          "youtube_finance_search_views", "github_trading_bot_repos"):
    C[k] = B[k] / 2

# 후보 D — A등급 4개만으로 만든 극단안(상한 확인용, 채택 후보는 아니다).
D = {k: CURRENT.get(k, 1.0) for k in
     ("kospi_high_gap", "kospi_speed_60d", "naver_search_trend",
      "kospi_asia_relative_strength")}


def main() -> None:
    cands = [("현행", CURRENT), ("A 역방향2제외", A), ("B 등급재배정", B),
             ("C B+단기축소", C), ("D A등급4개만", D)]
    cards = [scorecard(n, w) for n, w in cands]

    print("=== 종합점수 성적표 (표시점수 기준 · 앵커 통과 후) ===")
    hdr = f"{'안':16} {'합':>5} {'고점':>6} {'저점':>6} {'스프레드':>8} {'중앙':>6} {'초고온%':>7} {'저온%':>6} {'r_낙폭':>7} {'r_gap':>6}"
    print(hdr)
    print("-" * len(hdr))
    for c in cards:
        print(f"{c['name']:16} {c['wsum']:5.1f} {c['pk']:6.1f} {c['tr']:6.1f} "
              f"{c['spread']:8.1f} {c['med']:6.1f} {c['hot_pct']:7.1f} {c['cold_pct']:6.1f} "
              f"{c['r_dd']:7.3f} {c['r_gap']:6.3f}")

    print()
    print("=== 이벤트별 표시점수 (고점 3 / 저점 3) ===")
    print(f"{'안':16} {'25-11-03':>9} {'26-02-26':>9} {'26-06-22':>9}  |  "
          f"{'25-11-24':>9} {'26-03-31':>9} {'26-07-30':>9}")
    for c in cards:
        p = " ".join(f"{v:9.1f}" for v in c["peaks"])
        t = " ".join(f"{v:9.1f}" for v in c["troughs"])
        print(f"{c['name']:16} {p}  |  {t}")

    print()
    print("=== 원점수(앵커 통과 전) ===")
    for c in cards:
        print(f"{c['name']:16} 고점 {c['raw_pk']:5.1f}  저점 {c['raw_tr']:5.1f}  "
              f"스프레드 {c['raw_spread']:5.1f}")

    # 현행 대비 지금 값이 얼마나 움직이는지
    print()
    print("=== 최근 5영업일 표시점수 (안별) ===")
    tail = IDX[-5:]
    print(f"{'안':16} " + " ".join(f"{d.date()!s:>11}" for d in tail))
    for n, w in cands:
        d = displayed(composite(w)).reindex(tail)
        print(f"{n:16} " + " ".join(f"{v:11.1f}" if np.isfinite(v) else f"{'--':>11}" for v in d))


if __name__ == "__main__":
    main()
