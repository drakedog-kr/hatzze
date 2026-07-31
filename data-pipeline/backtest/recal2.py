"""전수 검사 3 — 25개 지표 가중치 재보정 (2026-08-01).

검사 2(2026-07-23) 이후 지표 셋이 바뀌었다:
  + foreign_sell_at_high (individual_net_buy 자리, 2.5)
  + limit_up_breadth     (investor_deposit 자리, 1.0)
  + kospi_speed_60d      (신규 축, 2.5)
  − kosdaq_kospi_ratio   (역방향이라 점수에서 제외)

검사 2의 판정 기준(동행성 r_gap · 이벤트 스프레드)을 그대로 써서 25개 전부를
같은 눈금 위에서 다시 잰다. engine.py 가 현행 config 를 그대로 import 하므로
여기 나오는 숫자는 "지금 프로덕션 설정"의 성적표다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine import CAPPED, HIGH_GAP, INDICATOR_WEIGHTS, kdf, kospi, pearson, spearman

pd.set_option("display.width", 200)

# ---------------------------------------------------------------- 정답지
# 고점 3개는 검사 2와 같다(±30일 국소 극점 검증 통과).
#
# **저점 3번째가 바뀌었다.** 검사 2(2026-07-23 작성)는 2026-07-20(6,516, 전고점
# −28.5%)을 바닥으로 썼는데, 그건 그때 가진 데이터의 끝이라 그렇게 보였을 뿐이다.
# 그 뒤로 07-28 6,024 → 07-29 5,663 → **07-30 5,594(전고점 −38.6%)**까지 더 빠졌고
# 07-31 에 6,595 로 +17.9% 반등했다. 07-20 은 중간 반등점(다음 3일 +8.9%)이었다.
#
# 그래서 저점은 07-30 으로 고친다. 07-20 을 그대로 쓴 결과도 같이 내서
# "정답지 하나가 지표 순위를 얼마나 흔드는가"를 볼 수 있게 한다.
PEAKS = ["2025-11-03", "2026-02-26", "2026-06-22"]
TROUGHS = ["2025-11-24", "2026-03-31", "2026-07-30"]
TROUGHS_OLD = ["2025-11-24", "2026-03-31", "2026-07-20"]  # 검사 2가 쓴 것
WIN = 7  # 이벤트 직전 영업일 수


def verify_events() -> None:
    print("=== 정답지 검증 — 국소 극점이 여전히 그 날짜인가 ===")
    for label, days, fn in (("고점", PEAKS, "max"), ("저점", TROUGHS, "min")):
        for d in days:
            ts = pd.Timestamp(d)
            w = kospi[(kospi.index >= ts - pd.Timedelta(days=30)) & (kospi.index <= ts + pd.Timedelta(days=30))]
            extreme = w.max() if fn == "max" else w.min()
            hit = "OK" if abs(kospi[ts] - extreme) < 1e-9 else f"어긋남(±30일 극값 {extreme:,.0f})"
            print(f"  {label} {d}  코스피 {kospi[ts]:>8,.0f}  {hit}")
    last = kospi.index.max()
    print(f"  표본 끝 {last.date()}  코스피 {kospi[last]:,.0f}  "
          f"(직전 고점 대비 {HIGH_GAP[last]:+.1f}%)")
    print()


def event_mean(s: pd.Series, days: list[str]) -> float:
    """이벤트 직전 WIN 영업일 평균."""
    vals = []
    for d in days:
        ts = pd.Timestamp(d)
        w = s[(s.index <= ts)].tail(WIN)
        if len(w):
            vals.append(w.mean())
    return float(np.mean(vals)) if vals else float("nan")


def per_event(s: pd.Series, days: list[str]) -> list[float]:
    out = []
    for d in days:
        ts = pd.Timestamp(d)
        w = s[(s.index <= ts)].tail(WIN)
        out.append(float(w.mean()) if len(w) else float("nan"))
    return out


def block_bootstrap_spread(s: pd.Series, n_boot: int = 2000, block: int = 20) -> tuple[float, float]:
    """스프레드의 블록 부트스트랩 신뢰구간.

    이벤트가 6개뿐이라 이벤트 자체를 리샘플하면 표본이 너무 작다. 대신
    지표 시계열을 블록 단위로 순환 이동시켜 '아무 관계 없을 때 스프레드가
    이만큼 나올 수 있나'를 본다 — 귀무분포를 만들어 실측치를 견준다.
    """
    aligned = s.reindex(kospi.index).dropna()
    if len(aligned) < 60:
        return float("nan"), float("nan")
    arr = aligned.to_numpy()
    idx = aligned.index
    rng = np.random.default_rng(20260801)
    null = []
    for _ in range(n_boot):
        shift = int(rng.integers(0, len(arr)))
        rolled = pd.Series(np.roll(arr, shift), index=idx)
        null.append(event_mean(rolled, PEAKS) - event_mean(rolled, TROUGHS))
    null = np.array([x for x in null if np.isfinite(x)])
    obs = event_mean(aligned, PEAKS) - event_mean(aligned, TROUGHS)
    # 귀무분포에서 실측 이상으로 큰 값이 나올 비율(단측)
    p = float((null >= obs).mean()) if np.isfinite(obs) else float("nan")
    return obs, p


def grade(spread: float, r_gap: float, n: int) -> str:
    if not np.isfinite(spread):
        return "?"
    if spread < -10:
        return "D"
    if spread < 0:
        return "D-"
    if spread >= 25 and r_gap > 0.3:
        return "A"
    if spread >= 10:
        return "B"
    return "C"


def main() -> None:
    verify_events()

    rows = []
    for slug, s in CAPPED.items():
        w = INDICATOR_WEIGHTS.get(slug, 0.0)
        aligned = s.reindex(kospi.index).dropna()
        n = len(aligned)
        pk = event_mean(s, PEAKS)
        tr = event_mean(s, TROUGHS)
        spread, p = block_bootstrap_spread(s)
        r_gap, _ = pearson(s, kdf["gap"])
        r_f60, _ = pearson(s, kdf["fwd60"])
        r_dd, _ = spearman(s, kdf["fwd_dd"])
        spread_old = pk - event_mean(s, TROUGHS_OLD)
        rows.append(
            dict(
                slug=slug, w=w, n=n,
                med=float(aligned.median()) if n else np.nan,
                floor_pct=float((aligned <= 0.5).mean() * 100) if n else np.nan,
                ceil_pct=float((aligned >= 99.5).mean() * 100) if n else np.nan,
                hot_pct=float((aligned >= 75).mean() * 100) if n else np.nan,
                peak=pk, trough=tr, spread=spread, sp_old=spread_old, p=p,
                r_gap=r_gap, r_fwd60=r_f60, r_dd=r_dd,
                grade=grade(spread, r_gap, n),
            )
        )

    df = pd.DataFrame(rows).sort_values("spread", ascending=False)
    print("=== 지표별 성적표 (현행 설정 · 표본 2025-07-09~2026-07-31) ===")
    print("spread = 고점3 직전 7영업일 평균 − 저점3 직전 7영업일 평균")
    print("p = 블록 부트스트랩 귀무분포에서 실측 이상이 나올 확률(작을수록 진짜 신호)")
    print()
    show = df[["slug", "w", "n", "med", "floor_pct", "ceil_pct", "hot_pct",
               "peak", "trough", "spread", "sp_old", "p", "r_gap", "r_fwd60", "r_dd", "grade"]]
    print(show.to_string(index=False, float_format=lambda x: f"{x:.2f}"))
    print()

    print("=== 이벤트별 분해 (고점/저점 각각) ===")
    for slug in df["slug"]:
        s = CAPPED[slug]
        pv = per_event(s, PEAKS)
        tv = per_event(s, TROUGHS)
        fmt = lambda xs: " ".join(f"{x:5.1f}" if np.isfinite(x) else "  --- " for x in xs)
        print(f"{slug:32} 고점[{fmt(pv)}]  저점[{fmt(tv)}]")

    df.to_pickle("backtest/recal2.pkl")
    print("\n저장: backtest/recal2.pkl")


if __name__ == "__main__":
    main()
