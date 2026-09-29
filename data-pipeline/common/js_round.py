"""화면(JS)과 같은 반올림 — 채널 글(send_telegram_broadcast)과 홈 요약(generate_daily_summary)이 같이 쓴다.

파이썬의 round()·`:.0f` 는 동점을 짝수로 보내(26.5 → 26) 사이트의 Math.round(27)와 1도 어긋난다.
점수·진행률이 소수 둘째 자리로 저장돼(calculate_score) x.50 이 실제로 나온다. 화면 옆에 서는 숫자는
여기를 거친다.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal


def js_quantize(value: float, places: str) -> Decimal:
    """JS 의 반올림(동점은 큰 쪽)을 배정도 실수의 **정확한 값** 위에서 흉내 낸다.

    Decimal(float) 은 그 double 이 실제로 담고 있는 값을 그대로 받는다(0.1 이 아니라
    0.1000000000000000055…). JS 의 Math.round·toFixed 도 같은 정확한 값을 기준으로
    가장 가까운 결과를 고르고 동점이면 큰 쪽을 택하므로, 여기서 ROUND_HALF_UP 을 걸면
    두 언어가 같은 답을 낸다.

    **산술로 흉내 내면 안 된다.** 처음엔 floor(x*10 + 0.5)/10 으로 썼는데 9.35 에서
    갈렸다 — 9.35 라는 double 은 실제로 9.34999999999999964… 여서 JS 는 "9.3" 을
    내는데, ×10 이 부동소수 반올림으로 정확히 93.5 가 되는 바람에 이쪽만 "9.4" 가 됐다.
    급부상 카드가 "▲9.3배"인데 채널이 "9.4배"라고 말하는, 딱 피하려던 종류의 어긋남이다.

    (JS 의 Math.round 는 음수 동점을 +∞ 쪽으로 보내 ROUND_HALF_UP 과 갈리지만, 여기 쓰는
    값은 과열도 0~100 과 언급 배수라 둘 다 음수가 될 수 없다.)
    """
    return Decimal(value).quantize(Decimal(places), rounding=ROUND_HALF_UP)


def js_round(value: float) -> int:
    """JS 의 Math.round 와 같은 반올림.

    Python 내장 round() 는 은행가 반올림이라 round(2.5)==2 인데 JS 는 3 이다. 도수는
    사이트가 Math.round 로 찍으므로(app/home/Hero.tsx), 같은 규칙을 써야 26℃ 자리에서
    둘이 1도 어긋나지 않는다. 지표 카드의 과열도도 Math.round 다(app/home/cards-*.tsx).
    """
    return int(js_quantize(value, "1"))


def js_fixed1(value: float) -> str:
    """JS 의 Number.prototype.toFixed(1) 과 같은 문자열.

    급부상 카드가 `s.ratio.toFixed(1)` 로 "9.4배"를 찍는다(app/kadera/page.tsx).
    """
    return str(js_quantize(value, "0.1"))
