"""낙관도 optimism()(generate_telegram_narratives) — 화면 optimismPct(lib/telegram-data.ts)와 **같은 반올림**인가.

화면은 Math.round(동점은 큰 쪽)로, 총평 digest 는 이 함수로 같은 개수에서 낙관도를 낸다. 파이썬 round() 는
은행가 반올림이라 (낙관+5)/(낙관+비관+10)×100 이 딱 x.5 이고 x 가 짝수면 1 작게 나와, 카드 큰 숫자 63% 옆
총평이 "62%"를 인용하거나 40.5 에서 라벨이 '중립'(화면) 대 '비관 우세'(총평)로 갈렸다.
아래 기대값은 화면 식을 node 에서 그대로 돌린 값이다: Math.round(((pos + 5) / (pos + neg + 10)) * 100).
"""
import math
from fractions import Fraction

import generate_telegram_narratives as KR


def test_half_rounds_up_like_math_round():
    assert KR.optimism(145, 85) == 63  # 62.5
    assert KR.optimism(76, 114) == 41  # 40.5
    assert KR.optimism(157, 233) == 41  # 40.5
    assert KR.tone_label(KR.optimism(76, 114)) == "중립"


def test_non_ties_unchanged():
    assert KR.optimism(122, 103) == 54
    assert KR.optimism(1500, 900) == 62
    assert KR.optimism(82, 0) == 95
    assert KR.optimism(8, 0) == 72
    assert KR.optimism(0, 0) is None


def test_matches_math_round_over_grid():
    # Math.round(x) 는 배정도 x 의 **정확한 값**에 1/2 을 더해 내림한 것이다. Fraction 으로 그대로 잰다.
    for pos in range(0, 301):
        for neg in range(0, 201):
            if pos + neg == 0:
                continue
            x = (pos + 5) / (pos + neg + 10) * 100
            want = math.floor(Fraction(x) + Fraction(1, 2))
            assert KR.optimism(pos, neg) == want, (pos, neg, x)
