"""재시도가 붙은 HTTP 요청 — 재시도 래퍼가 없던 fetch 스크립트들의 공용 창구.

## 왜 생겼나

2026-08-14 아침 실행에서 `fetch_dcinside_stock.py` 가 이렇게 죽었다.

    requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='gall.dcinside.com')
    Max retries exceeded ... (connect timeout=10)

첫 페이지 요청이 10초 안에 연결되지 않았고, **재시도가 없어 그대로 스텝이 실패**했다.
해외(GitHub Actions) 러너에서 한국 서버로 붙을 때 간헐적으로 나는 그 병이다 —
KRX·ECOS 에서 먼저 겪고 `common/krx_client.py`·`common/ecos_client.py` 에 재시도를
붙여 넘겼는데, **상용 한국 사이트는 멀쩡하다고 보고 안 붙였던 것**이 이번에 물렸다.

## 왜 실패 시 예외를 그대로 올리나

`krx_client.krx_get` 은 다 실패하면 None 을 주고 호출자가 그 날짜를 건너뛴다. 그쪽은
날짜별 백필이라 한 날짜를 빼도 나머지가 남지만, 여기 호출자들은 **한 번의 조회가 곧
그날 지표 전부**라 반쪽짜리로 이어 봐야 틀린 값이 저장된다. 그래서 소진되면 마지막
예외를 그대로 올린다 — 지금과 똑같이 스텝이 실패하고 알림이 열린다.
바뀌는 건 하나다: **한 번 삐끗해서 죽는 대신, 여러 번 시도한 뒤에 죽는다.**

## 재시도 대상

연결 실패(타임아웃 등) · 5xx · 429. **403 은 재시도하지 않는다** — KRX 는 일시 차단에
403 을 쓰지만(그래서 krx_client 만 예외로 재시도한다) 대부분의 호스트에서 403 은
권한 문제라 다시 걸어도 결과가 같다. 호출자가 필요하면 `retry_statuses` 로 넓힐 것.
"""

from __future__ import annotations

import time

import requests

from .retry import backoff_delay

# 해외 러너→한국 서버 간헐 타임아웃 대응. krx_client 와 같은 눈금을 쓴다
# (넉넉한 타임아웃 + 다회 재시도 + 지수 백오프).
DEFAULT_TIMEOUT_SEC = 30
DEFAULT_MAX_RETRIES = 4
RETRY_BASE_DELAY_SEC = 2
RETRY_MAX_DELAY_SEC = 20
DEFAULT_RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


def request_with_retry(
    method: str,
    url: str,
    *,
    label: str,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_statuses: frozenset[int] | set[int] = DEFAULT_RETRY_STATUSES,
    **kwargs,
) -> requests.Response:
    """`requests.request` 에 재시도를 씌운다. 다 실패하면 마지막 예외를 올린다.

    label 은 로그에 찍히는 이름이다(예: "DCInside"). 어느 호출이 흔들렸는지 실행 로그에서
    바로 읽히도록 필수로 받는다 — 스크립트 하나가 여러 호스트를 두드리는 경우가 있다.

    timeout 을 안 주면 DEFAULT_TIMEOUT_SEC 를 쓴다. 호출자가 준 값이 있으면 그대로 존중한다
    (알라딘처럼 이미 넉넉히 잡아 둔 곳이 있다).
    """
    kwargs.setdefault("timeout", DEFAULT_TIMEOUT_SEC)
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.request(method, url, **kwargs)
        except requests.exceptions.RequestException as e:
            last_error = e
            print(f"[{label}] 요청 실패 ({attempt}/{max_retries}): {e}")
            if attempt < max_retries:
                time.sleep(backoff_delay(attempt, RETRY_BASE_DELAY_SEC, RETRY_MAX_DELAY_SEC))
            continue

        if resp.status_code in retry_statuses:
            last_error = requests.exceptions.HTTPError(
                f"{resp.status_code} {resp.reason}", response=resp
            )
            print(f"[{label}] 응답 {resp.status_code} ({attempt}/{max_retries})")
            if attempt < max_retries:
                time.sleep(backoff_delay(attempt, RETRY_BASE_DELAY_SEC, RETRY_MAX_DELAY_SEC))
            continue

        return resp

    print(f"[{label}] {max_retries}번 모두 실패했습니다.")
    raise last_error  # type: ignore[misc]


def get_with_retry(url: str, *, label: str, **kwargs) -> requests.Response:
    return request_with_retry("GET", url, label=label, **kwargs)


def post_with_retry(url: str, *, label: str, **kwargs) -> requests.Response:
    return request_with_retry("POST", url, label=label, **kwargs)
