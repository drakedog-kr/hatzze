"""상장 1년이 안 된 ETF 의 '1년에 얼마' 어림 — 국내·미국 같은 규칙(scripts/fetch_etf_dividends.py).

'1년에 얼마'는 지난 365일에 지급된 건의 합이다. 상장한 지 1년이 안 된 ETF 는 그 합이 몇 차례치뿐이라 수익률이 낮게 선다 —
QNDX(2026-06-23 상장, 분기)는 한 건 0.02723 으로 0.11%, 같은 지수 QQQM 은 0.43%였다(2026-10-11). KODEX 200커버드콜액티브는
석 달치 495원으로 6.1%. 그래서 상장 1년 미만이면 남은 차례를 채워 1년치로 어림하고 `estimated` 를 켠다. 화면은 '추정' 알약을
달고 바스켓 후보에서 뺀다(lib/dividend.ts).

## 상장 1년 미만을 무엇으로 가르나 — 지급 기록이 아니라 상장일

  미국  stockanalysis 페이지의 상장일(inception)
  국내  1년 전 거래일의 KRX ETF 전 종목 목록에 없던 코드(etf_bydd_trd 를 그날로 한 번 더 부른다)

⛔ '1년 넘은 지급이 없다'로 가르면 안 된다. SEIBro 는 열다섯 달치만 받으므로, 연 1회 분배를 하다가 2026년에 분기로 바꾼
오래된 KODEX 업종 ETF(자동차·증권·코스피100 …)가 신규처럼 보였다 — 2026-10-11 실측 99개가 걸렸는데 그중 56개가 1년 넘게
상장돼 있던 것이다. 이런 ETF 는 5월 분배(4월 결산배당)가 유독 커서 평균으로 채우면 부푼다. 상장일로 가르면 지급이 있는 신규가
78개이고 그중 43개를 어림한다(월분배 35 · 분기 8, 나머지는 한 건뿐이거나 이미 한 해 차례를 채웠다).

## 어림 — 받은 것 + 남은 차례 × min(마지막 분배, 평균)

- 해마다 몇 번(주기)은 미국은 설정의 cadence, 국내는 지급 간격의 중앙값(두 건 이상일 때만). 한 건뿐인 국내 ETF 는 주기를
  몰라 어림하지 않는다(10-11 서른 개).
- 남은 차례의 금액은 마지막 분배와 평균 중 작은 것 — 오르는 중이면 평균, 내리는 중이면 마지막 건이라 받은 기록보다 부풀지
  않는다. 국내 주식형의 5월 분배가 마지막 건이 되어도 평균이 막는다. 첫 분배가 부분 기간이라 작은 것(PLUS 테슬라위클리
  커버드콜채권혼합 25원 뒤 200원대)은 받은 그대로 센다.
- 남은 차례를 마지막 지급일부터 주기대로 지급 건으로 붙인다(est) — 화면의 달력·다가오는 일정이 1년치 합과 맞게. 연간
  합(히어로·표)은 dps × 주수, 달력은 지급 건이라 한쪽만 어림하면 같은 종목의 두 칸이 어긋난다(app/dividend/calc.ts).
- 마지막 지급이 주기의 1.5배 넘게 끊겼으면 어림하지 않는다 — 멈춘 분배를 채우지 않게.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from statistics import median

# 지급 주기 → 해마다 몇 번. 설정(config/etf_dividends.py)과 표(etf_dividend.cadence)의 글자 그대로.
PER_YEAR = {"주": 52, "월": 12, "분기": 4, "반기": 2, "연": 1}
CADENCE = {n: c for c, n in PER_YEAR.items()}
_STEP_MONTHS = {12: 1, 4: 3, 2: 6, 1: 12}
_STEP_DAYS = {52: 7.0, 12: 30.4, 4: 91.3, 2: 182.6, 1: 365.0}
YEAR_DAYS = 365
# 이보다 적으면 1년 전 KRX 목록이 반쯤 온 것이다(2025-10-10 실측 1,029종목). 그날은 목록을 안 믿는다.
MIN_LISTED_YEAR_AGO = 500


def per_year_from_gaps(pays: list[str]) -> int | None:
    """지급일들(ISO) → 해마다 몇 번. 간격의 중앙값으로 가른다. 두 건이 안 되면 None."""
    days = sorted(date.fromisoformat(p) for p in pays)
    if len(days) < 2:
        return None
    gap = median((b - a).days for a, b in zip(days, days[1:]))
    if gap <= 10:
        return 52
    if gap <= 45:
        return 12
    if gap <= 120:
        return 4
    if gap <= 240:
        return 2
    return None


def listed_within_year(inception: str | None, today: date) -> bool:
    """상장일(ISO)이 지난 365일 안인가. 모르면 False — 어림은 상장일이 확인될 때만."""
    if not inception:
        return False
    try:
        return date.fromisoformat(inception) > today - timedelta(days=YEAR_DAYS)
    except ValueError:
        return False


def _add_months(d: date, k: int) -> date:
    y, m = divmod(d.month - 1 + k, 12)
    year, month = d.year + y, m + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def estimate(paid: list[tuple[str, float]], per_year: int | None, today: date) -> tuple[float, list[tuple[str, float]]] | None:
    """상장 1년 미만 ETF 의 (1년치 어림, 남은 차례 [(지급일, 금액)]). 어림할 게 없으면 None.

    paid 는 지난 1년에 지급된 건 (지급일 ISO, 1주당 금액). 이미 한 해 차례만큼 받았거나, 주기를 모르거나, 분배가 끊겼으면 None.
    """
    if not paid or per_year is None or per_year not in _STEP_DAYS:
        return None
    n = len(paid)
    if n >= per_year:
        return None
    ordered = sorted(paid)
    last_day = date.fromisoformat(ordered[-1][0])
    if (today - last_day).days > _STEP_DAYS[per_year] * 1.5:
        return None
    mean = sum(a for _, a in ordered) / n
    rate = min(ordered[-1][1], mean)
    rest: list[tuple[str, float]] = []
    for k in range(1, per_year - n + 1):
        d = last_day + timedelta(days=7 * k) if per_year == 52 else _add_months(last_day, _STEP_MONTHS[per_year] * k)
        rest.append((d.isoformat(), round(rate, 6)))
    return sum(a for _, a in ordered) + sum(a for _, a in rest), rest
