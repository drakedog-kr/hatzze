"""FRED(세인트루이스 연준) 시계열 조회 — 재시도 포함.

ECOS·KRX 와 같은 이유로 공통 클라이언트를 둔다: GitHub Actions 러너에서 간헐적으로
연결이 끊기는데, 그때마다 스크립트가 그날 데이터를 통째로 버리면 지표가 조용히
낡는다(common/ecos_client.py 의 EcosUnavailableError 와 같은 사정).

FRED 를 쓰는 이유는 재배포 제약 때문이다. 야후 ToS §2(e)(i)는 자동 수집·상업적
이용·대체 데이터피드 생성을 금지하고, KRX 약관 제6조 ②는 비상업 목적으로 한정한다.
반면 FRED 가 중계하는 미 재무부·연준 생산 시리즈는 미 정부 저작물이라 그 제약이
없다. **다만 FRED 안에서도 벤더 시리즈(S&P·CBOE·나스닥 등)는 벤더 약관을 따르므로,
새 시리즈를 붙일 땐 FRED 페이지의 저작권 표기를 확인할 것.**
"""

from __future__ import annotations

import time

import requests

from .config import FRED_API_KEY
from .retry import backoff_delay

BASE_URL = "https://api.stlouisfed.org/fred"
TIMEOUT_SEC = 30
MAX_ATTEMPTS = 4


class FredUnavailableError(RuntimeError):
    """네트워크 재시도를 소진했다. 호출자가 '이번 실행은 건너뛴다'를 택할 수 있게
    일반 예외와 구분한다."""


def observations(series_id: str, *, start: str | None = None) -> list[tuple[str, float]]:
    """시리즈의 (날짜, 값) 목록. 결측('.')은 빼고 돌려준다.

    FRED 는 결측을 숫자가 아니라 마침표 한 글자로 준다. 그대로 float() 에 넣으면
    ValueError 로 스크립트가 죽으므로 여기서 걸러 낸다 — 호출자마다 다시 걸러야 하는
    종류의 함정이다.
    """
    if not FRED_API_KEY:
        raise FredUnavailableError("FRED_API_KEY 가 없습니다(.env.local 확인).")

    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
    }
    if start:
        params["observation_start"] = start

    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            resp = requests.get(
                f"{BASE_URL}/series/observations", params=params, timeout=TIMEOUT_SEC
            )
            resp.raise_for_status()
            rows = resp.json().get("observations", [])
            return [
                (r["date"], float(r["value"]))
                for r in rows
                if r.get("value") not in (".", "", None)
            ]
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError) as exc:
            last_error = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(backoff_delay(attempt))

    raise FredUnavailableError(f"{series_id} 조회 실패: {last_error}")
