"""전수 검사 3 — 확정안(R) 전면 백테스트 (2026-08-01).

"이 지수가 실제로 작동하는가"를 네 가지로 묻는다.

  1) 이벤트 — 큰 고점에서 뜨겁고 큰 저점에서 차가운가
  2) 단조성 — 점수 4분위별 '향후 90일 최대낙폭'이 단조롭게 나빠지는가
     (이게 지수의 실용적 의미다. 점수가 높은 날 뒤에 더 크게 빠져야 한다)
  3) 국면 분포 — 초고온이 희소하되 죽어 있지 않은가
  4) 과적합 — 이벤트 하나 빼면 결론이 뒤집히는가

R 안의 배정 원칙(좌표하강 결과를 그대로 쓰지 않는 이유는 lever2.py 참고):
  · 제거는 **독립 근거(역방향)** 가 있는 것만 — put_call 하나.
  · 감량은 '지렛대 없음 + p 안 나옴' 이 겹칠 때만.
  · 증량은 A등급(p ≤ 0.05) 중 기존 축과 안 겹치는 것만, 그것도 +0.5 씩.
  · 표본이 짧아 못 잰 9개는 건드리지 않는다.
  · kospi_high_gap 은 sweep 이 올리라고 하지만 **올리지 않는다** — r_gap 이 1.00,
    즉 정답지 그 자체라 올리면 정답지를 베끼는 것이다(검사 2도 같은 이유로 감량했다).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine import CAPPED, INDICATOR_WEIGHTS, kdf, kospi, spearman
from recal2 import PEAKS, TROUGHS, event_mean
from compose2 import A, B, CURRENT, composite, displayed

# ---------------------------------------------------------------- 확정안 R
R = {
    # --- 유지: 핵심 축 (근거 충분, 지렛대 있음)
    "kospi_volume_surge": 4.5,             # +25.4 p=0.19 — 핵심 개념이라 유지
    "kospi_high_gap": 4.0,                 # +43.0 p=0.00 — 1위지만 정답지와 동일해 동결
    # --- 증량: A등급(p ≤ 0.05) 이면서 독립 축
    "naver_search_trend": 4.0,             # +39.6 p=0.02  (3.5 → 4.0)
    "kospi_speed_60d": 3.0,                # +42.3 p=0.03  (2.5 → 3.0)
    "kospi_asia_relative_strength": 2.5,   # +33.1 p=0.05  (2.0 → 2.5)
    "limit_up_breadth": 1.5,               # +25.3 p=0.00  (1.0 → 1.5)
    # --- 감량: 지렛대 없음 + p 안 나옴
    "foreign_sell_at_high": 1.5,           # sweep 0.50 · p=0.13 · 예측력 −0.00 (2.5 → 1.5)
    "upbit_speculation_index": 1.0,        # −8.1 역방향 (2.0 → 1.0) ※ 재설계 대기 중이라 0 아님
    "vkospi": 1.0,                         # +6.5 p=0.42 · 레짐 이동 (1.5 → 1.0)
    "small_business_crisis_index": 1.0,    # +6.1 · 초고온 0% (1.5 → 1.0)
    # --- 제거: 역방향, 검사 2가 kosdaq 에 한 것과 같은 처분
    # "put_call_ratio": 0.0                # −25.9 p=1.00 r_gap −0.55
    # --- 유지: 낙폭 판별에 기여(스프레드만 보면 놓친다)
    "market_actions_30d": 2.0,             # 빼면 r_낙폭 −0.311 → −0.255
    "leverage_etf_volume": 2.0,            # 빼면 r_낙폭 −0.311 → −0.286
    "buffett_index": 2.0,                  # r_낙폭 −0.64
    "kospi_gold_ratio": 1.0,               # r_낙폭 −0.70
    "usdkrw_volatility": 1.0,
    "luxury_consumption_index": 0.5,
    "fine_dining_search_index": 0.5,
    # --- 유지: 표본이 짧아 못 쟀다. 근거 없이 움직이면 그것도 과적합
    "turnover_concentration": 2.0,
    "dcinside_post_count": 2.0,
    "news_sentiment": 1.5,
    "brokerage_app_rank": 1.5,
    "bestseller_finance_ratio": 1.0,
    "youtube_finance_search_views": 1.0,
    "github_trading_bot_repos": 0.5,
}

CANDS = [("현행", CURRENT), ("A 역방향2제외", A), ("B 등급재배정", B), ("R 확정안", R)]


def q_monotonic(s: pd.Series) -> tuple[list[float], list[int]]:
    """점수 4분위별 향후 90일 최대낙폭 중앙값. 단조롭게 나빠져야 한다."""
    j = pd.concat([s.rename("score"), kdf["fwd_dd"]], axis=1).dropna()
    if len(j) < 40:
        return [], []
    q = pd.qcut(j["score"], 4, labels=False, duplicates="drop")
    med = [float(j.loc[q == i, "fwd_dd"].median() * 100) for i in sorted(set(q))]
    cnt = [int((q == i).sum()) for i in sorted(set(q))]
    return med, cnt


def stages(s: pd.Series) -> dict[str, float]:
    return {
        "저온": float((s < 25).mean() * 100),
        "상온": float(((s >= 25) & (s < 50)).mean() * 100),
        "고온": float(((s >= 50) & (s < 75)).mean() * 100),
        "초고온": float((s >= 75).mean() * 100),
    }


def main() -> None:
    print("=" * 92)
    print("1) 이벤트 — 큰 고점에서 뜨겁고 큰 저점에서 차가운가")
    print("=" * 92)
    print(f"{'안':14} {'25-11-03':>9} {'26-02-26':>9} {'26-06-22':>9} │ "
          f"{'25-11-24':>9} {'26-03-31':>9} {'26-07-30':>9} │ {'스프레드':>8} {'최저고점':>8}")
    for n, w in CANDS:
        s = displayed(composite(w))
        pk = [event_mean(s, [d]) for d in PEAKS]
        tr = [event_mean(s, [d]) for d in TROUGHS]
        sp = np.mean(pk) - np.mean(tr)
        print(f"{n:14} " + " ".join(f"{v:9.1f}" for v in pk) + " │ " +
              " ".join(f"{v:9.1f}" for v in tr) + f" │ {sp:8.1f} {min(pk):8.1f}")

    print()
    print("=" * 92)
    print("2) 단조성 — 점수 4분위별 향후 90일 최대낙폭 중앙값(%)")
    print("=" * 92)
    print("   점수가 높은 날 뒤에 더 크게 빠져야 한다. 단조롭게 나빠지면 지수가 '작동'한다는 뜻.")
    print()
    print(f"{'안':14} {'Q1(낮음)':>10} {'Q2':>10} {'Q3':>10} {'Q4(높음)':>10}  {'단조?':>6} {'Q4−Q1':>8} {'r_낙폭':>8}")
    for n, w in CANDS:
        s = displayed(composite(w))
        med, cnt = q_monotonic(s)
        mono = all(med[i] >= med[i + 1] for i in range(len(med) - 1))
        r, _ = spearman(s, kdf["fwd_dd"])
        print(f"{n:14} " + " ".join(f"{v:10.2f}" for v in med) +
              f"  {'예' if mono else '아니오':>6} {med[-1]-med[0]:8.2f} {r:8.3f}")

    print()
    print("=" * 92)
    print("3) 국면 분포 (%)")
    print("=" * 92)
    print(f"{'안':14} {'저온':>8} {'상온':>8} {'고온':>8} {'초고온':>8} {'중앙':>8} {'합':>6}")
    for n, w in CANDS:
        s = displayed(composite(w))
        st = stages(s)
        print(f"{n:14} " + " ".join(f"{st[k]:8.1f}" for k in ("저온", "상온", "고온", "초고온")) +
              f" {s.median():8.1f} {sum(w.values()):6.1f}")

    print()
    print("=" * 92)
    print("4) 과적합 — leave-one-out 스프레드")
    print("=" * 92)
    combos = [("전부", PEAKS, TROUGHS)]
    for d in PEAKS:
        combos.append((f"−고점{d[2:]}", [x for x in PEAKS if x != d], TROUGHS))
    for d in TROUGHS:
        combos.append((f"−저점{d[2:]}", PEAKS, [x for x in TROUGHS if x != d]))
    ser = {n: displayed(composite(w)) for n, w in CANDS}
    print(f"{'제외':14} " + " ".join(f"{n:>14}" for n, _ in CANDS) + f" {'R−현행':>9}")
    losses = 0
    for label, pk, tr in combos:
        vals = {n: event_mean(ser[n], pk) - event_mean(ser[n], tr) for n, _ in CANDS}
        d = vals["R 확정안"] - vals["현행"]
        losses += d <= 0
        print(f"{label:14} " + " ".join(f"{vals[n]:14.1f}" for n, _ in CANDS) +
              f" {d:+9.1f}" + ("  ← 뒤집힘" if d <= 0 else ""))
    print(f"\nR 안이 현행에 진 조합: {losses}/{len(combos)}")

    print()
    print("=" * 92)
    print("5) 원점수 분포 — 앵커 정합성")
    print("=" * 92)
    print(f"{'안':14} {'p10':>7} {'중앙':>7} {'p90':>7} {'최대':>7}")
    for n, w in CANDS:
        r = composite(w)
        print(f"{n:14} {r.quantile(.1):7.1f} {r.median():7.1f} {r.quantile(.9):7.1f} {r.max():7.1f}")
    cur, rr = composite(CURRENT), composite(R)
    print(f"\n중앙값 이동 {cur.median():.1f} → {rr.median():.1f} ({rr.median()-cur.median():+.1f})"
          f"  ·  p90 {cur.quantile(.9):.1f} → {rr.quantile(.9):.1f} ({rr.quantile(.9)-cur.quantile(.9):+.1f})")

    print()
    print("=" * 92)
    print("6) 월별 서사 — 지수가 실제 장세를 따라갔나 (R 확정안)")
    print("=" * 92)
    s = displayed(composite(R)); c = displayed(composite(CURRENT))
    k = kospi.reindex(s.index)
    m = pd.DataFrame({"R": s, "현행": c, "kospi": k}).resample("ME").agg(
        {"R": "mean", "현행": "mean", "kospi": "last"})
    m["코스피변동%"] = m["kospi"].pct_change() * 100
    print(f"{'월':10} {'코스피':>9} {'변동%':>8} {'현행':>8} {'R':>8} {'차이':>7}")
    for d, row in m.iterrows():
        ch = f"{row['코스피변동%']:8.1f}" if np.isfinite(row["코스피변동%"]) else f"{'—':>8}"
        print(f"{d.strftime('%Y-%m'):10} {row['kospi']:9,.0f} {ch} "
              f"{row['현행']:8.1f} {row['R']:8.1f} {row['R']-row['현행']:+7.1f}")

    print()
    print("=" * 92)
    print("7) 최근 10영업일")
    print("=" * 92)
    tail = s.index[-10:]
    print(f"{'날짜':12} {'코스피':>9} {'현행':>8} {'R':>8} {'차이':>7}")
    for d in tail:
        print(f"{d.date()!s:12} {kospi[d]:9,.0f} {c[d]:8.1f} {s[d]:8.1f} {s[d]-c[d]:+7.1f}")


if __name__ == "__main__":
    main()
