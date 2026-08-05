"""표시 눈금을 '이 해의 백분위'가 아니라 '원점수 절대 수준'에 앵커한다.

백분위 매핑의 문제: 표본이 코스피가 세 배가 된 해라, 그 해의 하위 5%가 곧 표시 12점이 된다.
그런데 그 시점의 시장은 전년 대비 +117%, 버핏지수 199% 로 절대 기준으론 전혀 차갑지 않다.
원점수 자체는 이미 절대 척도(모든 지표가 0이면 0, 다 최대면 100)이므로, 거기에 앵커를 건다.
"""
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

# 확정 구성: 속도 floor 0/50, 아시아 −20/20, 명품 42/78, 코스닥 제거
P = dict(P_g)
P["kospi_speed_60d"] = lin(mom, 0.0, 50.0)
P["kospi_asia_relative_strength"] = lin(series["kospi_asia_relative_strength"]["raw"], -20.0, 20.0)
P["luxury_consumption_index"] = lin(series["luxury_consumption_index"]["raw"], 42.0, 78.0)
P.pop("kosdaq_kospi_ratio")
# 장기 축 가중치는 **설정에서 그대로 읽는다.** 예전엔 검사 2 의 ④안 가중치표(W_kq)를 쓰고
# kospi_speed_60d 만 손으로 2.5 를 덧붙였는데, 그 표는 검사 2 시절 INDICATOR_WEIGHTS 를
# 베껴 굳힌 것이라 설정이 움직여도 여기는 안 움직였다. 실제로 검사 3(2026-08-01)이 여섯을
# 옮겼는데(naver 3.5→4.0 · asia 2.0→2.5 · speed 2.5→3.0 · vkospi 1.5→1.0 ·
# put_call 1.0→0.5 · upbit 2.0→1.0) 이 스크립트만 옛 수로 앵커를 뽑고 있었다.
# calculate_score.py 가 "가중치를 크게 바꾸면 여기로 다시 확인할 것" 이라고 가리키는 도구라,
# 운영이 안 쓰는 수를 쓰면 용도 자체가 어긋난다.
#
# ⚠️ 그래서 이 스크립트의 출력은 더 이상 §9-8 문서(2026-07-23)의 수치와 같지 않다. 그게 맞다 —
# 그때 이후로 가중치가 실제로 바뀌었다. 검사 2 시절 재현이 필요하면 그 시점 커밋을 볼 것.
#
# P 의 키로 만들므로 P 와 WL 이 **항상 같은 집합**이다. wavg 는 w.index 만 도니까, 예전처럼
# 손으로 한 칸을 붙이는 방식이면 지표가 W_kq 안팎을 드나들 때 라벨이 겹쳐 죽거나(2026-08-06
# kospi_speed_60d 가 그랬다) 반대로 P 에만 있는 지표를 조용히 빠뜨린다. 이제 둘 다 못 생긴다.
WL = pd.Series({k: W[k] for k in P})

long_raw = wavg(P, WL)
prod = (long_raw * WL.sum() + short_contrib) / (WL.sum() + short_w)
print(f"가중치 합 {WL.sum() + short_w:.1f} (장기 {WL.sum():.1f} + 단기 {short_w:.1f})")
print("원점수 분위:", np.percentile(prod.dropna(), [0, 5, 25, 50, 75, 95, 100]).round(1))
print(f"오늘 원점수 {prod.dropna().iloc[-1]:.1f}")
print("고점 원점수:", [round(prod.get(pd.Timestamp(d), float("nan")), 1) for d in PEAKS])
print("저점 원점수:", [round(prod.get(pd.Timestamp(d), float("nan")), 1) for d in TROUGHS])


def pmax(x, d, b=5, f=5):
    i = kospi.index.get_loc(pd.Timestamp(d))
    return x.reindex(kospi.index[max(0, i - b):i + f + 1]).max()


CANDS = {
    "A 백분위(현행)": None,
    "B 완만": [(18, 0), (34, 30), (47, 50), (57, 70), (64, 84), (72, 96), (82, 100)],
    "C 중간": [(16, 0), (34, 31), (46, 50), (56, 72), (63, 86), (70, 96), (80, 100)],
    "D 가파름": [(14, 0), (34, 32), (45, 50), (55, 74), (62, 88), (68, 97), (78, 100)],
}
rows = []
for nm, a in CANDS.items():
    if a is None:
        core = [(float(np.percentile(prod.dropna(), p)), t)
                for p, t in [(5, 12), (25, 33), (50, 50), (75, 72), (90, 86), (97, 96)]]
        a = [(22.0, 0)] + core + [(78.0, 100)]
    s = apply_anchors(prod, a).reindex(kospi.index)
    r = full(nm, s)
    r["기간최고"] = "/".join(f"{pmax(s, d):.0f}" for d in PEAKS)
    r["오늘"] = round(s.dropna().iloc[-1])
    rows.append(r)
print()
print("=" * 240)
print(pd.DataFrame(rows).set_index("안")[["기간최고", "고점", "저점", "오늘", "스프", "중앙", "저온", "상온", "고온", "초고온", "r_gap", "r_dd", "낙폭Q", "단조"]].to_string())

BEST = CANDS["C 중간"]
s = apply_anchors(prod, BEST).reindex(kospi.index)
print()
print("=" * 240)
print("C안 월별")
m = pd.DataFrame({"코스피": kospi, "점수": s}).resample("ME").agg({"코스피": "last", "점수": "mean"})
m["전월비%"] = (m["코스피"].pct_change() * 100).round(1)
m["국면"] = pd.cut(m["점수"], [-1, 25, 50, 75, 101], labels=["저온", "상온", "고온", "초고온"])
print(m.round(0).to_string())
print()
print("  LOO(앵커는 절대값이라 이벤트 제외와 무관 — 재산출 불필요)")
print(f"  오늘 {s.dropna().iloc[-1]:.0f} · 코스피 7,000+ 중앙 {s[kospi >= 7000].median():.0f}")
