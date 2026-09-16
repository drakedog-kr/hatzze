"""원/달러 환율 — 유럽중앙은행(ECB) 참조환율을 frankfurter.dev 로 받고, 안 되면 FRED `DEXKOUS`.

배당 페이지가 미국 배당을 원으로 옮길 때 쓴다(fetch_us_dividends.py · fetch_etf_dividends.py).

왜 ECB 인가. FRED 의 DEXKOUS 는 연준이 주 단위로 올려 열흘쯤 늦다(2026-09-15 실측: 최신이 09-04).
ECB 는 매 영업일 16:00 CET(한국 밤 11~12시)에 그날 참조환율을 내고 frankfurter.dev 가 그대로 중계하니
아침 07:00 KST 실행이 **전날** 값을 받는다(같은 날 실측 09-14 = 1,346.24). ECB 참조환율은 공개 자료라
재배포 제약이 없고(야후 ToS·KRX 비상업 조항과 다르다), 키도 없다. 핀허브 forex 는 우리 요금제에서 403.

⚠️ 주소는 `api.frankfurter.dev/v1`. 옛 `api.frankfurter.app` 은 301 로 넘어가는데 curl 이 안 따라가면 빈 HTML 이 온다.
"""

from __future__ import annotations

import json
import time
import urllib.request
from datetime import date, timedelta

from .fred_client import FredUnavailableError, observations
from .retry import backoff_delay

ECB_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW"
# 클라우드플레어가 파이썬 기본 UA 를 403 으로 막는다(2026-09-15 실측). 이름을 밝힌 UA 면 통과.
UA = "hatzze/1.0 (+https://hatzze.fun; contact: support@hatzze.fun)"
MAX_RETRIES = 3


def _ecb() -> tuple[float, str] | None:
    """(원/달러, 날짜). 세 번 시도, 못 받으면 None."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(ECB_URL, headers={"User-Agent": UA, "Accept": "application/json"}), timeout=20) as r:
                d = json.load(r)
            rate = float(d["rates"]["KRW"])
            day = str(d["date"])
            if rate > 0 and len(day) == 10:
                return rate, day
            return None
        except Exception as exc:  # noqa: BLE001
            print(f"[환율] ECB 조회 실패 ({attempt}/{MAX_RETRIES}): {exc}")
            if attempt < MAX_RETRIES:
                time.sleep(backoff_delay(attempt, 2, 10))
    return None


def _fred() -> tuple[float, str] | None:
    try:
        obs = observations("DEXKOUS", start=(date.today() - timedelta(days=20)).isoformat())
    except FredUnavailableError:
        return None
    return (obs[-1][1], obs[-1][0]) if obs else None


def usdkrw() -> tuple[float, str] | None:
    """(원/달러, 기준 날짜). ECB 먼저, 안 되면 FRED. 둘 다 없으면 None — 호출자는 그날 미국 종목을 뺀다."""
    fx = _ecb()
    if fx:
        print(f"[환율] ECB {fx[1]} {fx[0]:,.2f}원")
        return fx
    fx = _fred()
    if fx:
        print(f"[환율] ECB 가 안 와 FRED {fx[1]} {fx[0]:,.2f}원")
    return fx
