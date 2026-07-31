"""전수 검사 3 — 지표별 성적표에 '초고온 진입선'을 붙인다 (2026-08-01).

초고온 진입선 = progress 가 75(HOT_ZONE)가 되는 원값. 화면이 카드에 "기준선"으로
적는 바로 그 값이다(calculate_score.raw_at_progress).

스프레드만 보면 "이 지표가 고점을 잘 집는가"는 알아도 **"얼마가 되어야 뜨겁다는
말인가"**는 안 보인다. 진입선을 같이 놓아야 눈금이 현실 범위 안에 있는지 판단된다
(검사 2의 '닿을 수 없는 임계값' 6개가 그렇게 잡혔다).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from engine import CAPPED, INDICATOR_THRESHOLDS, INDICATOR_WEIGHTS, series, kospi
from recal2 import PEAKS, TROUGHS, event_mean, block_bootstrap_spread, grade
from engine import kdf, pearson, spearman

from scripts.calculate_score import HOT_ZONE, raw_at_progress

META = {r["slug"]: r for r in json.load(open(Path(__file__).parent / "indicators.json"))}
UNITS = {}
for f in sorted(Path("scripts").glob("fetch_*.py")):
    src = f.read_text()
    import re
    consts = dict(re.findall(r'^([A-Z][A-Z0-9_]*)\s*=\s*"([a-z0-9_]+)"\s*$', src, re.M))
    for m in re.finditer(r'"slug":\s*(?:"([a-z0-9_]+)"|([A-Z][A-Z0-9_]*))(.{0,600}?)"unit":\s*"([^"]*)"', src, re.S):
        lit, var, _, unit = m.groups()
        slug = lit or consts.get(var)
        if slug:
            UNITS.setdefault(slug, unit)


def hot_line(slug: str) -> float | None:
    """초고온(progress=75) 진입선의 원값."""
    cfg = INDICATOR_THRESHOLDS[slug]
    if cfg.get("relative_surge") is not None:
        # 거래대금: 기준선이 그날의 30일 평균에 붙어 매일 움직인다 → 최근값으로 대표
        det = series.get(slug)
        if det is None:
            return None
        for d in reversed(det.index):
            a = (det.loc[d, "details"] or {}).get("avg_30d")
            if a:
                return raw_at_progress(slug, HOT_ZONE, cfg.get("threshold", 0.0), cfg, float(a))
        return None
    if cfg["kind"] == "cumulative_average":
        vals = series[slug]["raw"] if slug in series else None
        if vals is None or not len(vals):
            return None
        thr = float(vals.expanding().mean().iloc[-1])
        return raw_at_progress(slug, HOT_ZONE, thr, cfg)
    return raw_at_progress(slug, HOT_ZONE, cfg["threshold"], cfg)


def fmt_line(slug: str, v: float | None) -> str:
    if v is None or not np.isfinite(v):
        return "—"
    u = UNITS.get(slug, "")
    if abs(v) >= 10000:
        return f"{v:,.0f}{u}"
    if abs(v) >= 100:
        return f"{v:,.1f}{u}"
    return f"{v:.2f}{u}"


def latest_raw(slug: str) -> float | None:
    s = series.get(slug)
    if s is None or not len(s):
        return None
    return float(s["raw"].iloc[-1])


def main() -> None:
    rows = []
    for slug, s in CAPPED.items():
        aligned = s.reindex(kospi.index).dropna()
        n = len(aligned)
        pk = event_mean(s, PEAKS)
        tr = event_mean(s, TROUGHS)
        spread, p = block_bootstrap_spread(s)
        r_gap, _ = pearson(s, kdf["gap"])
        r_dd, _ = spearman(s, kdf["fwd_dd"])
        hl = hot_line(slug)
        rows.append(dict(
            slug=slug,
            name=META.get(slug, {}).get("name", slug),
            w=INDICATOR_WEIGHTS.get(slug, 0.0),
            n=n,
            hot_line=fmt_line(slug, hl),
            latest=fmt_line(slug, latest_raw(slug)),
            hot_pct=float((aligned >= 75).mean() * 100) if n else np.nan,
            ceil_pct=float((aligned >= 99.5).mean() * 100) if n else np.nan,
            floor_pct=float((aligned <= 0.5).mean() * 100) if n else np.nan,
            peak=pk, trough=tr, spread=spread, p=p,
            r_gap=r_gap, r_dd=r_dd,
            grade=grade(spread, r_gap, n),
        ))

    df = pd.DataFrame(rows).sort_values("spread", ascending=False, na_position="last")
    out = df[["name", "w", "n", "hot_line", "latest", "floor_pct", "ceil_pct",
              "hot_pct", "peak", "trough", "spread", "p", "r_gap", "r_dd", "grade"]]
    out.columns = ["지표", "가중", "n", "초고온진입선", "최근값", "바닥%", "천장%",
                   "초고온%", "고점", "저점", "스프레드", "p", "r_gap", "r_낙폭", "등급"]
    print(out.to_string(index=False, float_format=lambda x: f"{x:.2f}"))
    df.to_pickle("backtest/table2.pkl")
    print("\n저장: backtest/table2.pkl")


if __name__ == "__main__":
    main()
