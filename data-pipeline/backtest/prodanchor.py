"""운영(26개) 기준 종합점수 분포로 앵커를 다시 잡는다.

백테스트 앵커는 장기 16개만으로 뽑은 값이라, 가중치의 31%를 차지하는 단기 9개가 들어가는
운영 점수에 그대로 쓰면 눈금이 어긋난다(실제로 오늘 원점수 29.4가 앵커 하한 33.4 밑으로
빠졌다). 단기 9개는 히스토리가 7~31일뿐이라 과거 시계열을 만들 수 없으므로, **각 지표의
관측 평균을 상수로 놓아** 운영 점수의 위치를 추정한다. 분산 기여를 0으로 두는 셈이라
보수적이다(무상관 신호라 어차피 분산 기여는 잡음에 가깝다).
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config.indicator_thresholds import INDICATOR_THRESHOLDS as T  # noqa: E402
from config.indicator_weights import INDICATOR_WEIGHTS as W  # noqa: E402
from scripts.calculate_score import compute_progress  # noqa: E402

from engine import kdf, kospi, spearman  # noqa: E402
from plan4 import apply_anchors, full, lin, wavg  # noqa: E402
from improve4b import P_g  # noqa: E402

pd.set_option("display.width", 330)
PEAKS = ["2025-11-03", "2026-02-26", "2026-06-22"]
TROUGHS = ["2025-11-24", "2026-03-31", "2026-07-20"]
# 장기 축(P_g)이 시계열을 못 만드는 지표들 = INDICATOR_WEIGHTS − P_g. 2026-08-06 현재 7개다.
# investor_deposit·individual_net_buy 는 지표 자체가 없어졌는데 이 목록에만 남아 있어서
# T[s] 가 KeyError 로 죽었다(=absolute.py 가 통째로 못 돌았다). 목록을 손으로 적어 두면
# 지표가 드나들 때마다 낡으므로, 가중치 표에서 장기 축을 빼는 식으로 구한다.
SHORT = [s for s in W if s not in P_g]

raw = json.load(open("values.json"))
by = defaultdict(dict)
for r in raw:
    by[r["slug"]][r["date"]] = r

# 단기 9개의 관측 평균 progress (새 눈금 기준)
means = {}
for s in SHORT:
    cfg = T[s]
    d = by[s]
    vals = sorted(d)
    if cfg["kind"] == "cumulative_average":
        run, out = [], []
        for k in vals:
            run.append(float(d[k]["raw_value"]))
            out.append(compute_progress(s, run[-1], sum(run) / len(run), cfg))
    else:
        out = [compute_progress(s, float(d[k]["raw_value"]), cfg["threshold"], cfg) for k in vals]
    means[s] = float(np.mean([min(max(v, 0), 100) for v in out]))
print(f"단기 {len(SHORT)}개 관측 평균 progress:")  # 지표가 드나들므로 세어서 찍는다(9 → 7)
for s, v in means.items():
    print(f"  {s:32} {v:5.1f}  (w={W[s]})")
short_contrib = sum(W[s] * means[s] for s in SHORT)
short_w = sum(W[s] for s in SHORT)
print(f"  → 가중 기여 {short_contrib:.1f} / 가중치 {short_w:.1f} (평균 {short_contrib/short_w:.1f})")

# 장기 축: ④++ 구성 (코스닥 교체·괴리 클램프 제거·거래대금 절대축·속도 축)
mom = ((kospi / kospi.shift(60) - 1) * 100).dropna()
P = dict(P_g)
P["kospi_speed_60d"] = lin(mom, 20.6, 51.3)
# 이 스크립트는 이름 그대로 **운영 기준** 앵커를 뽑는 곳이고, prod_raw 는 outer.py 가
# 가져다 쓴다. 그러니 장기 축도 운영 설정을 그대로 따라야 한다. 예전엔 검사 2 의 ④안
# 가중치표(W_kq)를 쓰면서 속도만 손으로 얹었는데, 그 표는 검사 2 시절 INDICATOR_WEIGHTS
# 를 베껴 굳힌 것이라 검사 3(2026-08-01)의 이동 여섯이 여기 하나도 안 들어와 있었다.
#
# kosdaq_kospi_ratio 는 검사 2 가 점수에서 뺀 지표라 설정에 아예 없다. ④안 P 에는 아직
# 남아 있으므로 여기서 덜어낸다(absolute.py 와 같은 처리). 안 덜면 W[k] 가 KeyError 다.
#
# P 의 키로 만들어 P 와 WL 을 같은 집합으로 묶는다. wavg 가 w.index 만 도는 탓에 둘이
# 어긋나면 지표가 조용히 빠지는데, 이렇게 두면 그럴 수가 없다.
#
# 위의 means 는 이 줄들보다 앞에서 끝나므로 absolute.py·refix.py 는 영향받지 않는다.
P.pop("kosdaq_kospi_ratio")
WL = pd.Series({k: W[k] for k in P})
long_raw = wavg(P, WL)
long_w = WL.sum()
print(f"\n장기 축 가중치 {long_w:.1f} + 단기 {short_w:.1f} = {long_w + short_w:.1f}")

prod_raw = (long_raw * long_w + short_contrib) / (long_w + short_w)
print("\n운영 기준 원점수 분포:")
print(prod_raw.describe().round(2).to_string())

TARGET = [(5, 12), (25, 33), (50, 50), (75, 72), (90, 86), (97, 96)]
anch = [(round(float(np.percentile(prod_raw.dropna(), p)), 1), t) for p, t in TARGET]
print(f"\n새 앵커(운영 기준): {anch}")

s = apply_anchors(prod_raw, anch)


def pmax(x, d, b=5, f=5):
    i = kospi.index.get_loc(pd.Timestamp(d))
    return x.reindex(kospi.index[max(0, i - b):i + f + 1]).max()


r = full("운영 기준 ④++", s)
r["기간최고"] = "/".join(f"{pmax(s, d):.0f}" for d in PEAKS)
loo = []
for drop in PEAKS:
    keep = pd.DatetimeIndex([d for d in kospi.index if abs((d - pd.Timestamp(drop)).days) > 45])
    a2 = [(float(np.percentile(prod_raw.reindex(keep).dropna(), p)), t) for p, t in TARGET]
    s2 = apply_anchors(prod_raw, a2)
    loo.append(min(pmax(s2, d) for d in PEAKS))
r["LOO최저"] = round(min(loo), 1)
print()
print(pd.DataFrame([r]).set_index("안")[["기간최고", "고점", "저점", "스프", "저온", "상온", "고온", "초고온", "r_gap", "r_dd", "낙폭Q", "단조", "LOO최저"]].to_string())

print("\n월별")
m = pd.DataFrame({"코스피": kospi, "점수": s}).resample("ME").agg({"코스피": "last", "점수": "mean"})
m["국면"] = pd.cut(m["점수"], [-1, 25, 50, 75, 101], labels=["저온", "상온", "고온", "초고온"])
print(m.round(1).to_string())
print(f"\n최근값(2026-07-22) {s.dropna().iloc[-1]:.1f}  / 원점수 {prod_raw.dropna().iloc[-1]:.1f}")
