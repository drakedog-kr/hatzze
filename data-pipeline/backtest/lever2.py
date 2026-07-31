"""전수 검사 3 — 어느 가중치가 '지렛대'인가 (2026-08-01).

B안에서 배운 것: 지표 하나의 스프레드가 커도, 이미 있는 축과 겹치면 가중치를
올려도 종합점수가 안 움직인다(속도 2.5→5.0 에 스프레드 +1.7, 급등 종목 비율은
올릴수록 최저 고점이 내려갔다).

그래서 배정 전에 지표마다 **가중치를 0 부터 훑으며 종합 스프레드가 얼마나
움직이는지**를 잰다. 이건 최적화가 아니라 진단이다 — 이벤트가 6개뿐이라
여기서 나온 최적값을 그대로 쓰면 과적합이다. 쓰는 건 세 가지 판정뿐이다:

  · 지렛대 없음(sweep 폭 < 1.0) → 얼마를 주든 점수가 안 변한다. 등급대로 두면 된다.
  · 단조 증가 → 올릴 근거가 있다.
  · 단조 감소 → 내릴 근거가 있다(0 이 최적이면 제외 후보).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine import CAPPED, INDICATOR_WEIGHTS, kdf, kospi, spearman
from recal2 import PEAKS, TROUGHS, event_mean
from compose2 import CURRENT, composite, displayed

GRID = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]


def stats(weights: dict[str, float]) -> tuple[float, float, float, float]:
    s = displayed(composite(weights))
    sp = event_mean(s, PEAKS) - event_mean(s, TROUGHS)
    minpk = min(event_mean(s, [d]) for d in PEAKS)
    hot = float((s >= 75).mean() * 100)
    r, _ = spearman(s, kdf["fwd_dd"])
    return sp, minpk, hot, r


def main() -> None:
    base_sp, base_pk, base_hot, base_r = stats(CURRENT)
    print("=== 기준(현행) ===")
    print(f"스프레드 {base_sp:.1f} · 최저고점 {base_pk:.1f} · 초고온 {base_hot:.1f}% · r_낙폭 {base_r:.3f}")
    print()
    print("=== 지렛대 진단 — 가중치를 훑을 때 종합 스프레드가 움직이는 폭 ===")
    print("(다른 지표는 현행 고정. 폭 = sweep 최대 − 최소)")
    print()

    rows = []
    for slug in CURRENT:
        vals = []
        for g in GRID:
            w = dict(CURRENT)
            w[slug] = g
            if sum(w.values()) == 0:
                vals.append(np.nan)
                continue
            vals.append(stats(w)[0])
        vals = np.array(vals)
        span = np.nanmax(vals) - np.nanmin(vals)
        best = GRID[int(np.nanargmax(vals))]
        # 단조성: 현행보다 위/아래에서 개선되는가
        cur = CURRENT[slug]
        up = np.nanmax([v for g, v in zip(GRID, vals) if g > cur] or [np.nan])
        dn = np.nanmax([v for g, v in zip(GRID, vals) if g < cur] or [np.nan])
        at = vals[GRID.index(cur)] if cur in GRID else np.nan
        if span < 1.0:
            verdict = "지렛대 없음"
        elif best > cur + 0.4:
            verdict = f"올릴 근거 (최적 {best:.1f})"
        elif best < cur - 0.4:
            verdict = f"내릴 근거 (최적 {best:.1f})"
        else:
            verdict = "현행이 최적"
        rows.append(dict(slug=slug, cur=cur, span=span, best=best,
                         at=at, up=up, dn=dn, verdict=verdict))

    df = pd.DataFrame(rows).sort_values("span", ascending=False)
    print(f"{'지표':32} {'현행':>5} {'sweep폭':>8} {'최적':>5} {'판정':<22}")
    print("-" * 78)
    for _, r in df.iterrows():
        print(f"{r['slug']:32} {r['cur']:5.1f} {r['span']:8.2f} {r['best']:5.1f} {r['verdict']:<22}")

    print()
    print("=== 제외 후보 확인 — 가중치 0 이 최적인 지표 ===")
    for _, r in df.iterrows():
        if r["best"] == 0.0 and r["span"] >= 1.0:
            w = dict(CURRENT); w[r["slug"]] = 0.0
            sp, pk, hot, rr = stats(w)
            print(f"  {r['slug']:32} 제외 시 스프레드 {base_sp:.1f} → {sp:.1f} ({sp-base_sp:+.1f}) "
                  f"· r_낙폭 {base_r:.3f} → {rr:.3f}")
    print()


if __name__ == "__main__":
    main()
