"""전수 검사 3 — B안 과적합 점검 + 앵커 정합성 (2026-08-01).

B안은 이벤트 6개(고점3·저점3)를 보고 만든 것이다. 이벤트가 6개뿐이라
**어느 하나를 빼면 결론이 뒤집히는지**를 반드시 봐야 한다. 검사 2 때
kospi_speed_60d 가 3.5 이상에서 leave-one-out 에 깨졌던 그 검사다.

1) leave-one-out — 이벤트 하나씩 빼고 스프레드 재계산
2) 반기 분할 — 전반기 이벤트로 정한 가중치가 후반기에도 사는가
3) 앵커 정합성 — 원점수 분포가 옮겨가 SCORE_DISPLAY_ANCHORS 가 어긋나는가
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine import kospi
from recal2 import PEAKS, TROUGHS, WIN, event_mean
from compose2 import A, B, C, CURRENT, composite, displayed

IDX = kospi.index


def spread_for(raw: pd.Series, peaks: list[str], troughs: list[str]) -> float:
    return event_mean(raw, peaks) - event_mean(raw, troughs)


def leave_one_out() -> None:
    print("=== 1) Leave-one-out — 이벤트 하나씩 빼고 스프레드 ===")
    print("표시점수 기준. 현행 대비 B안이 **모든 제외 조합에서** 이겨야 채택할 수 있다.")
    print()
    cands = [("현행", CURRENT), ("A", A), ("B", B), ("C", C)]
    series = {n: displayed(composite(w)) for n, w in cands}

    combos = [("전부", PEAKS, TROUGHS)]
    for i, d in enumerate(PEAKS):
        combos.append((f"−고점{d[2:]}", [x for x in PEAKS if x != d], TROUGHS))
    for i, d in enumerate(TROUGHS):
        combos.append((f"−저점{d[2:]}", PEAKS, [x for x in TROUGHS if x != d]))

    hdr = f"{'제외':16} " + " ".join(f"{n:>8}" for n, _ in cands) + f"  {'B−현행':>8}"
    print(hdr)
    print("-" * len(hdr))
    losses = 0
    for label, pk, tr in combos:
        vals = {n: spread_for(series[n], pk, tr) for n, _ in cands}
        diff = vals["B"] - vals["현행"]
        if diff <= 0:
            losses += 1
        mark = "  ← 뒤집힘" if diff <= 0 else ""
        print(f"{label:16} " + " ".join(f"{vals[n]:8.1f}" for n, _ in cands) + f"  {diff:+8.1f}{mark}")
    print()
    print(f"B안이 현행에 진 조합: {losses}/{len(combos)}")
    print()


def half_split() -> None:
    print("=== 2) 반기 분할 — 전반기에서 정한 게 후반기에도 사는가 ===")
    mid = pd.Timestamp("2026-01-31")
    early_p = [d for d in PEAKS if pd.Timestamp(d) <= mid]
    early_t = [d for d in TROUGHS if pd.Timestamp(d) <= mid]
    late_p = [d for d in PEAKS if pd.Timestamp(d) > mid]
    late_t = [d for d in TROUGHS if pd.Timestamp(d) > mid]
    print(f"전반기 고점{early_p} 저점{early_t}")
    print(f"후반기 고점{late_p} 저점{late_t}")
    print()
    print(f"{'안':10} {'전반기':>10} {'후반기':>10}")
    for n, w in (("현행", CURRENT), ("A", A), ("B", B), ("C", C)):
        s = displayed(composite(w))
        e = spread_for(s, early_p, early_t)
        l = spread_for(s, late_p, late_t)
        print(f"{n:10} {e:10.1f} {l:10.1f}")
    print()


def speed_sweep() -> None:
    """검사 2가 kospi_speed_60d 상한을 2.5로 잡은 근거를 다시 확인한다.

    당시 근거: '3.5 이상은 leave-one-out 에서 2025-11 고점이 깨진다'.
    B안은 4.0 으로 올렸으니 그 제약이 아직 유효한지 봐야 한다.
    """
    print("=== 3) kospi_speed_60d 가중치 sweep — 검사 2의 '2.5 상한'이 아직 맞나 ===")
    print("판정: 세 고점의 표시점수가 모두 70 이상으로 남아야 한다(검사 2 기준).")
    print()
    print(f"{'w':>5} {'25-11':>8} {'26-02':>8} {'26-06':>8} {'최저고점':>9} {'스프레드':>9} {'초고온%':>8}")
    for wv in (2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0):
        w = dict(B)
        w["kospi_speed_60d"] = wv
        s = displayed(composite(w))
        pk = [event_mean(s, [d]) for d in PEAKS]
        sp = spread_for(s, PEAKS, TROUGHS)
        hot = float((s >= 75).mean() * 100)
        flag = "" if min(pk) >= 70 else "  ← 고점 하나가 70 미만"
        print(f"{wv:5.1f} " + " ".join(f"{v:8.1f}" for v in pk) +
              f" {min(pk):9.1f} {sp:9.1f} {hot:8.1f}{flag}")
    print()


def limitup_sweep() -> None:
    print("=== 4) limit_up_breadth sweep — p=0.00 이라 올렸는데 어디까지 되나 ===")
    print(f"{'w':>5} {'최저고점':>9} {'스프레드':>9} {'r_낙폭':>8} {'초고온%':>8}")
    from engine import kdf, spearman
    for wv in (1.0, 1.5, 2.0, 2.5, 3.0, 3.5):
        w = dict(B)
        w["limit_up_breadth"] = wv
        s = displayed(composite(w))
        pk = min(event_mean(s, [d]) for d in PEAKS)
        sp = spread_for(s, PEAKS, TROUGHS)
        r, _ = spearman(s, kdf["fwd_dd"])
        hot = float((s >= 75).mean() * 100)
        print(f"{wv:5.1f} {pk:9.1f} {sp:9.1f} {r:8.3f} {hot:8.1f}")
    print()


def anchor_check() -> None:
    """가중치를 바꾸면 원점수 분포가 옮겨간다. 앵커가 절대 수준에 걸려 있으니
    분포가 통째로 밀리면 표시점수가 의도와 다르게 움직인다."""
    print("=== 5) 앵커 정합성 — 원점수 분포가 얼마나 옮겨갔나 ===")
    print("SCORE_DISPLAY_ANCHORS = (14,0) (32,31) (44,50) (54,72) (61,86) (68,96) (78,100)")
    print()
    print(f"{'안':16} {'p10':>7} {'중앙':>7} {'p90':>7} {'최대':>7} {'고점평균':>9} {'저점평균':>9}")
    for n, w in (("현행", CURRENT), ("A", A), ("B", B), ("C", C)):
        r = composite(w)
        print(f"{n:16} {r.quantile(.10):7.1f} {r.median():7.1f} {r.quantile(.90):7.1f} "
              f"{r.max():7.1f} {event_mean(r, PEAKS):9.1f} {event_mean(r, TROUGHS):9.1f}")
    print()
    cur, b = composite(CURRENT), composite(B)
    print(f"중앙값 이동: {cur.median():.1f} → {b.median():.1f} ({b.median()-cur.median():+.1f})")
    print(f"p90   이동: {cur.quantile(.9):.1f} → {b.quantile(.9):.1f} ({b.quantile(.9)-cur.quantile(.9):+.1f})")
    print()
    print("판정 기준: 중앙값이 크게 밀리면 '평범한 날'의 표시점수가 통째로 바뀐다.")
    print("           ±1.5 이내면 앵커를 그대로 둬도 뜻이 유지된다고 본다.")
    print()


if __name__ == "__main__":
    leave_one_out()
    half_split()
    speed_sweep()
    limitup_sweep()
    anchor_check()
