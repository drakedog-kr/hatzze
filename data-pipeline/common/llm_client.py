"""LLM 호출을 구독(Claude Code CLI)으로 보내고, 안 되면 API 키로 되돌린다.

## 왜 있나

파이프라인은 Haiku 호출에 월 $66 쯤 쓴다. Max 구독에는 headless 호출(`claude -p`)이
포함돼 있어서, 같은 호출을 구독으로 보내면 그 청구가 사라진다. 다만 구독은 한도가
코딩 세션과 같은 풀이라 언제든 모자랄 수 있다. 그래서 **구독을 먼저 쓰고 실패하면
지금 쓰던 API 키로 같은 요청을 한 번 더 보낸다.**

## 쓰는 법

호출부는 안 고친다. 클라이언트를 만드는 한 줄만 바꾸면 된다.

    from common.llm_client import get_llm_client
    client = get_llm_client(ANTHROPIC_API_KEY)
    resp = client.messages.create(model=..., max_tokens=..., system=..., messages=[...])

`CLAUDE_CODE_OAUTH_TOKEN` 이 없으면 처음부터 API 클라이언트를 그대로 돌려준다. 즉
토큰을 안 넣은 환경에서는 예전과 똑같이 돈다.

## 지원하는 요청 모양

이 저장소의 동기 호출 아홉 곳이 전부 같은 모양이다 — 모델·max_tokens·system·user
메시지 하나, 그리고 선택적으로 구조화 출력. 그 밖의 모양(대화 여러 턴, 도구, 온도)은
구독 경로로 안 보내고 API 로 넘긴다. 배치 API 는 구독에 없어서 여기서 안 다룬다.

## 알아 둘 것

- **CLI 에는 `max_tokens` 에 해당하는 플래그가 없다.** 길이는 시스템 프롬프트가 잡는다.
  길이 검사 루프가 있는 호출부(히어로·한 줄·총평)는 그 루프가 그대로 동작한다.
- **자식 프로세스의 환경에서 `ANTHROPIC_API_KEY` 를 지워야 한다.** Claude Code 의 자격
  우선순위에서 API 키가 OAuth 토큰보다 위라, 안 지우면 구독으로 보낸 줄 알았던 호출이
  조용히 API 로 청구된다.
- **실패가 `subtype: "success"` 로 온다.** 인증이 안 된 실행도 그렇게 나온다. 그래서
  `is_error` 와 `structured_output`·출력 토큰까지 봐야 성공을 가릴 수 있다.
- **연달아 실패하면 구독 경로를 끈다.** 한도가 소진된 날 157번을 다 두 번씩 부르면
  느리고 비싸다. `_MAX_CONSECUTIVE_FAILURES` 번 내리 실패하면 그 실행에서는 API 만 쓴다.
"""

from __future__ import annotations

import atexit
import json
import os
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from anthropic import Anthropic

from common.config import ANTHROPIC_API_KEY

# 구독 경로를 끄는 문턱. 한도 소진처럼 한 번 실패하면 계속 실패하는 상황에서
# 모든 호출을 두 번씩 태우지 않기 위한 것이다.
_MAX_CONSECUTIVE_FAILURES = 3

# 한 호출의 상한. 실측 중앙값이 12초라 넉넉히 잡았다(재시도가 CLI 안에서 도는 경우 포함).
_TIMEOUT_SEC = 180


@dataclass
class _Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


@dataclass
class _TextBlock:
    text: str
    type: str = "text"


@dataclass
class _Response:
    """Anthropic 응답에서 호출부가 실제로 읽는 것만 흉내 낸다."""

    content: list[_TextBlock]
    usage: _Usage = field(default_factory=_Usage)
    stop_reason: str = "end_turn"


class SubscriptionUnavailable(RuntimeError):
    """구독 경로로 답을 못 받았다 — 호출부가 아니라 이 모듈이 잡아 API 로 넘긴다."""


def _cli_env() -> dict[str, str]:
    env = dict(os.environ)
    # 우선순위상 API 키·베어러 토큰이 OAuth 토큰을 이긴다. 지우지 않으면 구독으로
    # 보낸 줄 알았던 호출이 그대로 API 청구가 된다.
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"):
        env.pop(k, None)
    # Haiku 도 기본으로 생각을 한다. 분류·문장화에는 필요 없고 출력 토큰만 는다.
    env["MAX_THINKING_TOKENS"] = "0"
    return env


def _run_cli(
    *, model: str, system: str | None, user: str, schema: dict | None
) -> _Response:
    argv = [
        "claude",
        "-p",
        "--model",
        model,
        # 도구를 비운다. 구조화 출력용 내부 도구만 남는다 — `--disallowedTools "*"` 로
        # 막으면 그 도구까지 막혀 답을 영영 못 받는다.
        "--tools",
        "",
        # 이 기계의 훅·플러그인·CLAUDE.md 가 끼어들지 않게 한다.
        "--setting-sources",
        "",
        "--no-session-persistence",
        # 구조화 출력이 도구 호출 한 턴을 더 쓴다. 1 이면 무조건 실패한다.
        "--max-turns",
        "3",
        "--output-format",
        "json",
    ]
    if system:
        argv += ["--system-prompt", system]
    if schema:
        argv += ["--json-schema", json.dumps(schema, ensure_ascii=False)]

    try:
        proc = subprocess.run(
            argv,
            input=user,
            capture_output=True,
            text=True,
            env=_cli_env(),
            timeout=_TIMEOUT_SEC,
        )
    except FileNotFoundError as exc:
        raise SubscriptionUnavailable("claude CLI 없음") from exc
    except subprocess.TimeoutExpired as exc:
        raise SubscriptionUnavailable(f"{_TIMEOUT_SEC}초 초과") from exc

    try:
        out = json.loads(proc.stdout) if proc.stdout.strip() else {}
    except json.JSONDecodeError:
        out = {}

    if proc.returncode != 0:
        # 한도 초과·인증 만료 같은 실패는 stderr 가 비고 stdout 의 JSON `result` 에 이유가 온다.
        # 그걸 버리면 "종료 코드 1" 만 남아 폴백이 왜 났는지 알 수 없다(2026-09-12 실제로 그랬다).
        why = str(out.get("result") or (proc.stderr or "").strip() or proc.stdout.strip())[:200]
        raise SubscriptionUnavailable(f"종료 코드 {proc.returncode}: {why}")
    if not out:
        raise SubscriptionUnavailable(f"JSON 아님: {proc.stdout[:200]}")

    # ⚠️ `subtype` 만 보면 안 된다 — 로그인이 안 된 실행도 success 로 온다.
    if out.get("is_error"):
        raise SubscriptionUnavailable(str(out.get("result"))[:200])

    usage = out.get("usage") or {}
    u = _Usage(
        input_tokens=usage.get("input_tokens") or 0,
        output_tokens=usage.get("output_tokens") or 0,
        cache_creation_input_tokens=usage.get("cache_creation_input_tokens") or 0,
        cache_read_input_tokens=usage.get("cache_read_input_tokens") or 0,
    )
    if u.output_tokens <= 0:
        raise SubscriptionUnavailable("출력 토큰 0 — 모델이 안 돌았다")

    if schema:
        data = out.get("structured_output")
        if data is None:
            raise SubscriptionUnavailable(f"구조화 출력 없음: {out.get('subtype')}")
        # 호출부는 텍스트를 받아 json.loads 한다. 같은 모양으로 돌려준다.
        text = json.dumps(data, ensure_ascii=False)
    else:
        text = (out.get("result") or "").strip()
        if not text:
            raise SubscriptionUnavailable("빈 응답")

    return _Response(content=[_TextBlock(text=text)], usage=u)


class _Messages:
    def __init__(self, owner: "SubscriptionClient") -> None:
        self._owner = owner
        # 배치 API 는 구독에 없다. 호출부가 `client.messages.batches.*` 를 쓰면 그대로 API 로 간다
        # (analyze_telegram_messages 의 지난 배치 수거가 이걸 쓴다).
        self.batches = owner.api.messages.batches

    def create(self, **kw: Any) -> Any:
        owner = self._owner
        if owner.enabled and _is_simple_request(kw):
            t0 = time.time()
            try:
                resp = _run_cli(
                    model=kw["model"],
                    system=_system_text(kw.get("system")),
                    user=_user_text(kw["messages"]),
                    schema=_schema_of(kw),
                )
            except SubscriptionUnavailable as exc:
                owner.note_failure(str(exc))
            else:
                owner.note_success(time.time() - t0, resp.usage)
                return resp
        return owner.api.messages.create(**kw)


class SubscriptionClient:
    """구독 우선 + API 폴백. `.messages.create` 만 노출한다."""

    def __init__(self, api: Anthropic) -> None:
        self.api = api
        self.messages = _Messages(self)
        self.enabled = True
        self.calls_subscription = 0
        self.calls_fallback = 0
        self.input_tokens = 0        # 캐시 안 탄 입력
        self.cache_read_tokens = 0   # 캐시에서 읽은 입력(한도에 덜 잡힌다)
        self.cache_write_tokens = 0
        self.output_tokens = 0
        self.seconds = 0.0
        self._consecutive = 0
        # 분류처럼 스레드 여럿이 동시에 부르는 호출부가 있다(analyze_telegram_messages).
        self._lock = threading.Lock()

    def note_success(self, elapsed: float, usage: _Usage) -> None:
        with self._lock:
            self.calls_subscription += 1
            self.input_tokens += usage.input_tokens
            self.cache_read_tokens += usage.cache_read_input_tokens
            self.cache_write_tokens += usage.cache_creation_input_tokens
            self.output_tokens += usage.output_tokens
            self.seconds += elapsed
            self._consecutive = 0

    def note_failure(self, why: str) -> None:
        with self._lock:
            self.calls_fallback += 1
            self._consecutive += 1
            print(f"[LLM] 구독 실패 → API 로 재시도: {why}")
            if self.enabled and self._consecutive >= _MAX_CONSECUTIVE_FAILURES:
                self.enabled = False
                print(
                    f"[LLM] 구독 경로를 이 실행에서 끕니다 "
                    f"({_MAX_CONSECUTIVE_FAILURES}회 연속 실패) — 남은 호출은 API 로 갑니다."
                )

    def report(self) -> None:
        """실행 끝에 한 줄. `/usage` 와 대조하는 근거가 이 줄이다."""
        total = self.calls_subscription + self.calls_fallback
        if not total:
            return
        print(
            f"[LLM] 호출 {total}건 · 구독 {self.calls_subscription} · API 폴백 {self.calls_fallback} · "
            f"구독 토큰 입력 {self.input_tokens:,} (캐시 읽기 {self.cache_read_tokens:,} · 쓰기 {self.cache_write_tokens:,}) "
            f"출력 {self.output_tokens:,} · 구독 소요 {self.seconds:.0f}초"
        )


def report(client: Any) -> None:
    """호출부 끝에서 부른다. 평범한 Anthropic 클라이언트면 아무것도 안 찍는다."""
    if isinstance(client, SubscriptionClient):
        client.report()


def uses_subscription(client: Any) -> bool:
    """지금 이 클라이언트가 구독 경로를 켠 상태인가. 배치 API 를 쓸지 동기로 갈지 가르는 데 쓴다."""
    return isinstance(client, SubscriptionClient) and client.enabled


def _system_text(system: Any) -> str | None:
    if system is None or isinstance(system, str):
        return system
    # 블록 배열로 준 경우 텍스트만 잇는다.
    if isinstance(system, list):
        return "\n\n".join(
            b.get("text", "") for b in system if isinstance(b, dict)
        ).strip()
    return None


def _user_text(messages: Any) -> str:
    content = messages[0]["content"]
    if isinstance(content, str):
        return content
    return "\n\n".join(
        b.get("text", "") for b in content if isinstance(b, dict)
    ).strip()


def _schema_of(kw: dict) -> dict | None:
    fmt = (kw.get("output_config") or {}).get("format") or {}
    return fmt.get("schema") if fmt.get("type") == "json_schema" else None


def _is_simple_request(kw: dict) -> bool:
    """CLI 로 그대로 옮길 수 있는 모양인가.

    아니면 조용히 API 로 보낸다 — 여기서 억지로 옮기면 요청의 뜻이 달라진다.
    """
    msgs = kw.get("messages") or []
    if len(msgs) != 1 or msgs[0].get("role") != "user":
        return False
    if kw.get("tools") or kw.get("temperature") is not None:
        return False
    if _system_text(kw.get("system")) is None and kw.get("system") is not None:
        return False
    oc = kw.get("output_config") or {}
    if oc and _schema_of(kw) is None:
        return False  # effort 등 다른 output_config 는 CLI 로 못 옮긴다
    return True


def oauth_token() -> str:
    return (os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or "").strip()


# 호출부의 "자격이 없으면 건너뛴다" 가드용. 예전엔 API 키만 봤는데, 구독 토큰만
# 있어도 LLM 을 부를 수 있으니 둘 중 하나만 있으면 된다.
HAS_LLM_CREDENTIAL = bool(ANTHROPIC_API_KEY) or bool(oauth_token())


def get_llm_client(api_key: str | None) -> Any:
    """구독 우선 클라이언트. 토큰이 없으면 평소의 Anthropic 클라이언트를 그대로 준다."""
    api = Anthropic(api_key=api_key)
    if not oauth_token() or os.environ.get("LLM_FORCE_API"):
        return api
    if not shutil.which("claude"):
        print("[LLM] claude CLI 가 없어 API 로만 돕니다.")
        return api
    print("[LLM] 구독(claude -p) 우선 · 실패 시 API 폴백")
    client = SubscriptionClient(api)
    # 호출부마다 끝에서 report() 를 부르게 하면 return 갈래마다 빠뜨린다. 프로세스가 끝날 때
    # 한 번 찍는 게 확실하다(2026-09-12 첫 실행에서 요약 줄이 안 찍혀 폴백 여부를 못 셌다).
    atexit.register(client.report)
    return client
