"""전수 검사 3 — "이 지수가 실제로 작동하는가" 정면으로 묻기 (2026-08-01).

final3.py 에서 4분위 단조성이 깨졌다(−2.28 / −1.67 / −2.69 / −15.36).
Q1~Q3 이 구분이 안 되고 Q4 에서만 절벽이 생긴다. 두 해석이 가능하다.

  (가) 지수는 '연속 온도계'가 아니라 '고온 경보기'다 — 상위권에서만 뜻이 있다.
  (나) 표본에 대형 폭락이 하나뿐이라, Q4 = '그 폭락 직전' 이고 나머지는 전부
       상승장이다. 즉 사건 하나가 만든 착시다.

가르는 방법: (1) 십분위로 모양을 보고, (2) **2026-06 고점 직전 구간을 통째로
빼고** 같은 걸 다시 재 본다. 빼도 Q4 효과가 남으면 (가), 사라지면 (나)다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine import kdf, kospi, spearman
from compose2 import CURRENT, composite, displayed
from final3 import R

CANDS = [("현행", CURRENT), ("R 확정안", R)]


def deciles(s: pd.Series, mask: pd.Series | None = None) -> None:
    j = pd.concat([s.rename("score"), kdf["fwd_dd"]], axis=1).dropna()
    if mask is not None:
        j = j[mask.reindex(j.index).fillna(True)]
    q = pd.qcut(j["score"], 10, labels=False, duplicates="drop")
    print(f"  {'십분위':>6} {'n':>4} {'점수범위':>16} {'향후90일 최대낙폭 중앙':>22}")
    for i in sorted(set(q)):
        g = j[q == i]
        print(f"  {i+1:>6} {len(g):>4} {g['score'].min():7.1f}~{g['score'].max():6.1f} "
              f"{g['fwd_dd'].median()*100:22.2f}%")


def quartiles(s: pd.Series, mask: pd.Series | None = None) -> tuple[list[float], float]:
    j = pd.concat([s.rename("score"), kdf["fwd_dd"]], axis=1).dropna()
    if mask is not None:
        j = j[mask.reindex(j.index).fillna(True)]
    if len(j) < 40:
        return [], float("nan")
    q = pd.qcut(j["score"], 4, labels=False, duplicates="drop")
    med = [float(j.loc[q == i, "fwd_dd"].median() * 100) for i in sorted(set(q))]
    r = float(pd.concat([j["score"].rank(), j["fwd_dd"].rank()], axis=1).corr().iloc[0, 1])
    return med, r


def main() -> None:
    print("=" * 88)
    print("1) 십분위로 본 모양 (현행)")
    print("=" * 88)
    deciles(displayed(composite(CURRENT)))

    print()
    print("=" * 88)
    print("2) 2026 대폭락 직전 구간을 빼면 Q4 효과가 남는가")
    print("=" * 88)
    print("   2026-06-22 고점의 향후 90일 창(2026-04-01~2026-06-30)을 통째로 제외한다.")
    print("   이 구간이 Q4 의 대부분을 만든 용의자다.")
    print()
    drop = (kdf.index >= "2026-04-01") & (kdf.index <= "2026-06-30")
    keep = pd.Series(~drop, index=kdf.index)
    print(f"   제외 {int(drop.sum())}일 / 전체 {len(kdf)}일")
    print()
    for n, w in CANDS:
        s = displayed(composite(w))
        full, r_full = quartiles(s)
        sub, r_sub = quartiles(s, keep)
        print(f"  {n}")
        print(f"    전체    Q1~Q4 " + " ".join(f"{v:8.2f}" for v in full) +
              f"   Q4−Q1 {full[-1]-full[0]:7.2f}  r {r_full:+.3f}")
        if sub:
            print(f"    폭락제외 Q1~Q4 " + " ".join(f"{v:8.2f}" for v in sub) +
                  f"   Q4−Q1 {sub[-1]-sub[0]:7.2f}  r {r_sub:+.3f}")
        else:
            print("    폭락제외 표본 부족")
        print()

    print("=" * 88)
    print("3) 초고온(75+) 이 실제로 경보였나 — 국면별 향후 90일 낙폭")
    print("=" * 88)
    for n, w in CANDS:
        s = displayed(composite(w))
        j = pd.concat([s.rename("score"), kdf["fwd_dd"]], axis=1).dropna()
        print(f"  {n}")
        for label, m in (("저온 <25", j["score"] < 25),
                         ("상온 25~50", (j["score"] >= 25) & (j["score"] < 50)),
                         ("고온 50~75", (j["score"] >= 50) & (j["score"] < 75)),
                         ("초고온 75+", j["score"] >= 75)):
            g = j[m]
            if not len(g):
                print(f"    {label:12} n=  0")
                continue
            print(f"    {label:12} n={len(g):3}  낙폭 중앙 {g['fwd_dd'].median()*100:7.2f}%  "
                  f"최악 {g['fwd_dd'].min()*100:7.2f}%  −10% 이상 빠진 비율 "
                  f"{(g['fwd_dd'] <= -0.10).mean()*100:5.1f}%")
        print()

    print("=" * 88)
    print("4) 실전 질문 — 초고온이 켜졌을 때 그 뒤가 실제로 나빴나")
    print("=" * 88)
    for n, w in CANDS:
        s = displayed(composite(w))
        hot = s[s >= 75]
        if not len(hot):
            print(f"  {n}: 초고온 없음"); continue
        # 연속 구간으로 묶기
        runs, cur = [], [hot.index[0]]
        for a, b in zip(hot.index, hot.index[1:]):
            if (b - a).days <= 5:
                cur.append(b)
            else:
                runs.append(cur); cur = [b]
        runs.append(cur)
        print(f"  {n} — 초고온 구간 {len(runs)}개")
        for rn in runs:
            st, en = rn[0], rn[-1]
            fwd = kdf["fwd_dd"].reindex(rn).min()
            print(f"    {st.date()} ~ {en.date()} ({len(rn):3}일)  코스피 {kospi[st]:,.0f}→{kospi[en]:,.0f}"
                  f"  이후 90일 최대낙폭 {fwd*100:+.1f}%")
        print()


if __name__ == "__main__":
    main()
