"""LLM 을 여러 건 동시에 묻고, 결과와 출력은 **원래 차례대로** 돌려준다.

## 왜 있나

테마 요약(국장 80건 · 957초, 미장 50건 · 690초) · 종목 흐름 요약 · 급부상 한 줄이 한 건씩 차례로 물어서, 2026-10-09
저녁 실행이 LLM 답을 기다리는 데만 34분을 썼다. 메시지 분류 · DCInside 제목 감성 · 시장 판정은 이미 8개씩 동시에
묻는다(SYNC_WORKERS · SUBSCRIPTION_WORKERS) — 같은 구독 경로라 동시 호출 자체는 검증된 길이다.

## 지키는 것

- **동시에 도는 건 `work(item)` 하나뿐이다.** 호출부는 '묻고 · 다시 쓰게 하고 · 후보를 고르는' 데까지만 work 에 넣고,
  DB 쓰기와 결과 줄은 받은 뒤 원래 차례대로 한다. 앞 항목의 결과에 기대는 규칙은 work 에 넣지 않는다 — 그러면 같은
  답이 오면 차례로 돌린 것과 같은 결과가 나온다(tests/test_llm_parallel.py).
- **출력이 섞이지 않는다.** work 안에서 print 한 줄은 그 항목 몫으로 모았다가 차례가 오면 한꺼번에 찍는다.
- **한도에 걸린 날은 하나씩 돈다.** 구독이 막혀 API 로 넘어간 호출(SubscriptionClient.calls_fallback)이 이 묶음에서
  FALLBACK_SERIAL 건에 닿으면 남은 항목은 하나씩 돈다. 한도가 찬 날 동시에 몰아 API 청구를 키우지 않게.
- **끄는 스위치.** 동시 개수는 환경 변수 LLM_WORKERS(기본 DEFAULT_WORKERS). 1 이면 예전처럼 차례대로 돈다.
- work 가 던진 예외는 그 항목의 결과로 돌려준다. 호출부가 예전처럼 '실패' 줄을 찍고 다음 항목으로 간다.
"""

from __future__ import annotations

import io
import os
import sys
import threading
from collections.abc import Callable, Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor
from typing import Any, TypeVar

T = TypeVar("T")
R = TypeVar("R")

# 메시지 분류(8)보다 하나 낮춘 값. 테마 요약 한 건이 다시 쓰기까지 서너 번 묻는 묶음이라 실제 동시 호출은 이보다 덜 몰린다.
DEFAULT_WORKERS = 6
FALLBACK_SERIAL = 2

_local = threading.local()


def workers_from_env() -> int:
    try:
        return max(1, int(os.environ.get("LLM_WORKERS", DEFAULT_WORKERS)))
    except ValueError:
        return DEFAULT_WORKERS


class _ThreadStdout:
    """스레드마다 모으는 통이 있으면 그리로, 없으면(메인 스레드) 원래 stdout 으로 쓴다."""

    def __init__(self, real: Any) -> None:
        self._real = real

    def write(self, s: str) -> int:
        buf = getattr(_local, "buf", None)
        return (buf if buf is not None else self._real).write(s)

    def flush(self) -> None:
        if getattr(_local, "buf", None) is None:
            self._real.flush()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._real, name)


def _fallbacks(client: Any) -> int:
    return getattr(client, "calls_fallback", 0)


def ordered(
    work: Callable[[T], R], items: Iterable[T], *, client: Any = None, workers: int | None = None
) -> Iterator[tuple[T, R | Exception]]:
    """(항목, 결과 또는 예외)를 items 차례대로 낸다. 앞 항목이 끝나는 대로 하나씩 나오므로 호출부는 받는 대로 저장한다."""
    items = list(items)
    n = workers or workers_from_env()
    if n <= 1 or len(items) <= 1:
        for it in items:
            try:
                yield it, work(it)
            except Exception as exc:  # noqa: BLE001 — 동시 경로와 같은 모양으로 돌려준다
                yield it, exc
        return

    start = _fallbacks(client)
    serial = threading.Lock()
    degraded = threading.Event()

    def check(buf: io.StringIO) -> None:
        if not degraded.is_set() and _fallbacks(client) - start >= FALLBACK_SERIAL:
            degraded.set()
            buf.write(f"[LLM] 이 묶음에서 API 폴백이 {FALLBACK_SERIAL}건에 닿아 남은 항목은 하나씩 묻습니다.\n")

    def run(it: T) -> tuple[R | Exception, str]:
        buf = io.StringIO()
        check(buf)  # 시작 전에도 본다 — 끝난 뒤에만 보면 그 사이 시작한 항목이 동시에 돈다
        _local.buf = buf
        try:
            if degraded.is_set():
                with serial:
                    res: R | Exception = work(it)
            else:
                res = work(it)
        except Exception as exc:  # noqa: BLE001
            res = exc
        finally:
            _local.buf = None
        check(buf)
        return res, buf.getvalue()

    real = sys.stdout
    sys.stdout = _ThreadStdout(real)
    try:
        with ThreadPoolExecutor(max_workers=n) as ex:
            futs = [ex.submit(run, it) for it in items]
            for it, fut in zip(items, futs):
                res, out = fut.result()
                if out:
                    real.write(out)
                    real.flush()
                yield it, res
    finally:
        sys.stdout = real
