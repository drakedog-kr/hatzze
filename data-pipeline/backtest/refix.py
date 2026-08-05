"""과적합된 floor 를 '절대 의미가 있는 값'으로 되돌리고, 코스닥 제거 후 다시 검증."""
import numpy as np
import pandas as pd

from engine import kdf, kospi, series, spearman
from plan4 import apply_anchors, full, lin, wavg
from improve4b import P_g
from prodanchor import means as SHORT_MEANS

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config.indicator_weights import INDICATOR_WEIGHTS as W  # noqa: E402

pd.set_option("display.width", 330)
PEAKS = ["2025-11-03", "2026-02-26", "2026-06-22"]
TROUGHS = ["2025-11-24", "2026-03-31", "2026-07-20"]
mom = ((kospi / kospi.shift(60) - 1) * 100).dropna()

SHORT = list(SHORT_MEANS)
short_contrib = sum(W[s] * SHORT_MEANS[s] for s in SHORT)
short_w = sum(W[s] for s in SHORT)


def pmax(x, d, b=5, f=5):
    i = kospi.index.get_loc(pd.Timestamp(d))
    return x.reindex(kospi.index[max(0, i - b):i + f + 1]).max()


TARGET = [(5, 12), (25, 33), (50, 50), (75, 72), (90, 86), (97, 96)]

# 은퇴한 지표의 가중치. 검사 2 가 kosdaq_kospi_ratio 를 0 으로 빼면서 INDICATOR_WEIGHTS 에서
# 아예 사라졌는데, 이 스크립트의 ①~④ 는 **"코스닥을 빼기 전" 상태를 재현하는 게 목적**이라
# 그 지표가 P 에 남아 있어야 한다. 설정에 값이 없으므로 검사 2 의 2.0 을 화석인 채로 둔다.
# ⑤ 이후는 P 에서 빠지므로 이 칸도 따라 사라진다 — 즉 화석은 ①~④ 안에서만 산다.
# absolute.py·prodanchor.py 가 이 문제를 안 겪은 건 둘 다 P.pop 으로 코스닥을 먼저 빼서
# P 가 처음부터 설정과 같은 집합이기 때문이다.
RETIRED = {"kosdaq_kospi_ratio": 2.0}


def run(name, pmap, target=TARGET, outer=(22.0, 78.0)):
    # 장기 축 가중치는 **설정에서 그대로 읽는다.** 예전엔 검사 2 의 ④안 가중치표(W_kq)를 쓰고
    # kospi_speed_60d 만 손으로 얹었는데, 그 표는 검사 2 시절 INDICATOR_WEIGHTS 를 베껴 굳힌
    # 것이라 설정이 움직여도 여기는 안 움직였다(검사 3 이 여섯을 옮겼다). absolute.py·
    # prodanchor.py 가 먼저 같은 정리를 받았다.
    #
    # pmap 의 키로 만들므로 P 와 WL 이 **항상 같은 집합**이다. wavg 는 w.index 만 도니까,
    # 손으로 칸을 붙이는 방식이면 지표가 W_kq 안팎을 드나들 때 라벨이 겹쳐 죽거나, 반대로
    # P 에만 있는 지표를 조용히 빠뜨린다. 이제 둘 다 구조적으로 못 생긴다.
    # ⑤안처럼 P 에서 코스닥을 빼면 가중치도 따라 빠지므로 축을 따로 만들 필요가 없다.
    wl = pd.Series({k: W[k] if k in W else RETIRED[k] for k in pmap})
    long_raw = wavg(pmap, wl)
    prod = (long_raw * wl.sum() + short_contrib) / (wl.sum() + short_w)
    core = [(float(np.percentile(prod.dropna(), p)), t) for p, t in target]
    a = [(outer[0], 0)] + core + [(outer[1], 100)]
    s = apply_anchors(prod, a).reindex(kospi.index)
    r = full(name, s)
    r["기간최고"] = "/".join(f"{pmax(s, d):.0f}" for d in PEAKS)
    r["최근"] = round(s.dropna().iloc[-1], 1)
    r["원점수최근"] = round(prod.dropna().iloc[-1], 1)
    r["앵커"] = [round(x, 1) for x, _ in core]
    return r, s, prod


rows = []
# ① 현재 배포 상태
P0 = dict(P_g)
P0["kospi_speed_60d"] = lin(mom, 20.6, 51.3)
r, _, _ = run("① 지금 (속도 floor 20.6)", P0)
rows.append(r)

# ② 속도 floor 를 절대 기준(0%)으로
P1 = dict(P_g)
P1["kospi_speed_60d"] = lin(mom, 0.0, 50.0)
r, _, _ = run("② 속도 floor 0 / ceil 50", P1)
rows.append(r)

# ③ ② + 아시아 floor 되돌림(-10 → -20, ceil 23 → 20)
P2 = dict(P1)
P2["kospi_asia_relative_strength"] = lin(series["kospi_asia_relative_strength"]["raw"], -20.0, 20.0)
r, _, _ = run("③ ②+아시아 floor −20", P2)
rows.append(r)

# ④ ③ + 명품 floor 48 → 42
P3 = dict(P2)
P3["luxury_consumption_index"] = lin(series["luxury_consumption_index"]["raw"], 42.0, 78.0)
r, _, _ = run("④ ③+명품 floor 42", P3)
rows.append(r)

# ⑤ ④ + 코스닥 지표 제거
P4 = {k: v for k, v in P3.items() if k != "kosdaq_kospi_ratio"}
r, s5, prod5 = run("⑤ ④+코스닥 제거", P4)
rows.append(r)

print("=" * 250)
print("floor 되돌림 + 코스닥 제거 효과")
print(pd.DataFrame(rows).set_index("안")[["기간최고", "고점", "저점", "최근", "원점수최근", "스프", "저온", "상온", "고온", "초고온", "r_gap", "r_dd", "낙폭Q", "단조"]].to_string())

print()
print("=" * 250)
print("⑤ 상태에서 '오늘 30 초반'을 만들려면 앵커 목표를 어떻게 잡아야 하나")
print(f"  오늘 원점수 {prod5.dropna().iloc[-1]:.1f} / 분포 p5={np.percentile(prod5.dropna(),5):.1f} p25={np.percentile(prod5.dropna(),25):.1f} p50={np.percentile(prod5.dropna(),50):.1f}")
for tgt, outer in [
    ([(5, 12), (25, 33), (50, 50), (75, 72), (90, 86), (97, 96)], (22.0, 78.0)),
    ([(5, 22), (25, 38), (50, 52), (75, 72), (90, 86), (97, 96)], (14.0, 82.0)),
    ([(5, 28), (25, 42), (50, 55), (75, 73), (90, 86), (97, 96)], (10.0, 84.0)),
]:
    r, s, _ = run(f"목표 p5→{tgt[0][1]}", P4, target=tgt, outer=outer)
    print(f"  p5→{tgt[0][1]:>2} | 기간최고 {r['기간최고']} | 고점 {r['고점']} | 저점 {r['저점']} | 최근 {r['최근']:5.1f} | 저온 {r['저온']}% 상온 {r['상온']}% 고온 {r['고온']}% 초고온 {r['초고온']}% | 단조 {r['단조']}")
