"""common/llm_parallel — LLM 을 동시에 묻되 결과 · 출력은 원래 차례대로. 같은 답이 오면 차례로 돌린 것과 결과가 같아야 한다."""
import json
import sys
import threading
import time

import pytest

from common import llm_parallel as P
from common.llm_parallel import ordered

import generate_theme_briefs as TB


def _slow_echo(i: int) -> int:
    # 뒤 항목이 먼저 끝나게 — 차례를 지키는지 보려고.
    time.sleep(0.01 * (5 - i % 5))
    print(f"[{i}] 시작")
    print(f"[{i}] 끝")
    return i * 10


def test_results_and_output_keep_order(capsys):
    got = [(i, r) for i, r in ordered(_slow_echo, range(10), workers=4)]
    assert got == [(i, i * 10) for i in range(10)]
    lines = capsys.readouterr().out.splitlines()
    assert lines == [f"[{i}] {w}" for i in range(10) for w in ("시작", "끝")]


def test_same_as_serial(capsys):
    serial = list(ordered(_slow_echo, range(7), workers=1))
    out_serial = capsys.readouterr().out
    parallel = list(ordered(_slow_echo, range(7), workers=5))
    assert parallel == serial
    assert capsys.readouterr().out == out_serial


def test_exception_is_returned_in_place():
    def work(i):
        if i == 2:
            raise ValueError("둘")
        return i

    got = list(ordered(work, range(4), workers=3))
    assert [i for i, _ in got] == [0, 1, 2, 3]
    assert isinstance(got[2][1], ValueError) and got[3][1] == 3
    # 차례대로 경로도 같은 모양
    assert isinstance(list(ordered(work, range(4), workers=1))[2][1], ValueError)


def test_stdout_restored_even_on_early_break():
    real = sys.stdout
    for _i, _r in ordered(_slow_echo, range(6), workers=3):
        break
    assert sys.stdout is real
    list(ordered(_slow_echo, range(3), workers=2))
    assert sys.stdout is real


class _FakeClient:
    def __init__(self):
        self.calls_fallback = 0
        self.lock = threading.Lock()


def test_falls_back_to_one_at_a_time_after_api_fallbacks(capsys):
    client = _FakeClient()
    running = 0
    peak_after = 0
    state = threading.Lock()

    def work(i):
        nonlocal running, peak_after
        if i in (0, 1):
            with client.lock:
                client.calls_fallback += 1  # 구독이 막혀 API 로 넘어간 호출 — 곧바로 끝난다
            return i
        with state:
            running += 1
            # 전환 직후 이미 돌고 있던 항목(2~7)이 다 끝난 뒤에 시작하는 항목만 잰다.
            if i >= 14:
                peak_after = max(peak_after, running)
        time.sleep(0.02)
        with state:
            running -= 1
        return i

    got = [r for _i, r in ordered(work, range(16), client=client, workers=6)]
    assert got == list(range(16))
    assert peak_after == 1  # 폴백이 FALLBACK_SERIAL 건에 닿은 뒤 시작한 항목은 하나씩 돈다
    assert "남은 항목은 하나씩" in capsys.readouterr().out


def test_workers_from_env(monkeypatch):
    monkeypatch.delenv("LLM_WORKERS", raising=False)
    assert P.workers_from_env() == P.DEFAULT_WORKERS
    monkeypatch.setenv("LLM_WORKERS", "1")
    assert P.workers_from_env() == 1
    monkeypatch.setenv("LLM_WORKERS", "0")
    assert P.workers_from_env() == 1
    monkeypatch.setenv("LLM_WORKERS", "여섯")
    assert P.workers_from_env() == P.DEFAULT_WORKERS


# ── 실제 테마 요약 함수에 가짜 답을 넣어 차례 · 동시 결과를 견준다 ────────────────


def _fake_brief(system: str, user: str) -> str:
    # 첫 답은 한 문단(문단 수 검사에 걸려 다시 쓰게 된다), 다시 쓰라는 말엔 두 문단. 답은 받은 글로만 정해진다.
    head = user.splitlines()[-1][:20]
    time.sleep(0.005 * (len(user) % 4))
    para = f"{head} 이야기가 가장 많이 돌았습니다. 관련 공시와 기사 제목이 함께 옮겨졌습니다. 채널 글 가운데 실적 이야기가 이어졌습니다."
    if user.startswith("방금 쓴"):
        return f"{para}\n\n그 밖에는 수주 소식과 지분 공시 이야기가 함께 돌았습니다. 같은 소식을 다룬 글이 여러 번 옮겨졌습니다."
    return para


def _fake_talk(system: str, user: str) -> str:
    # talk_prompt 의 '### 번호 이름' 줄마다 한 줄. 첫 줄은 문장으로 끝나 검사에 걸리고(다시 묻게 된다), 다시 물으면 명사형으로 답한다.
    heads = [x.split(" ", 2) for x in user.splitlines() if x.startswith("### ")]
    again = "방금 쓴 줄" in user
    lines = [{"n": int(h[1]), "talk": f"{h[2]} 신규 공급 계약 소식" if again or int(h[1]) > 1 else f"{h[2]} 공급 계약이 화제였습니다"} for h in heads]
    return json.dumps({"results": lines}, ensure_ascii=False)


def _theme(theme: str) -> dict:
    digest = f"[테마] {theme}\n- {theme} 대표 종목 공급 계약 소식"
    items = [(f"{theme}{k}", f"{theme}종목{k}", f"- {theme}종목{k} 공급 계약 소식") for k in range(3)]
    return {"brief": TB.write_brief(_fake_brief, "시스템", digest, theme), "talk": TB.write_talk(_fake_talk, "시스템", theme, items)}


def test_theme_writers_same_serial_and_parallel(capsys):
    themes = ["반도체", "바이오", "조선", "방산", "금융", "2차전지", "자동차"]
    serial = list(ordered(_theme, themes, workers=1))
    out_serial = capsys.readouterr().out
    parallel = list(ordered(_theme, themes, workers=6))
    assert parallel == serial
    assert capsys.readouterr().out == out_serial
    assert all(not isinstance(r, Exception) for _t, r in parallel)
    # 빈 결과끼리 같아서 통과하는 게 아니다 — 다시 쓰기를 거쳐 두 문단 요약과 도는 얘기 줄이 실제로 나온다.
    assert all(r["brief"] and r["brief"].count("\n\n") == 1 and len(r["talk"]) == 3 for _t, r in parallel)
    assert "다시 씁니다" in out_serial


@pytest.mark.parametrize("workers", [1, 4])
def test_empty_and_single(workers):
    assert list(ordered(lambda x: x, [], workers=workers)) == []
    assert list(ordered(lambda x: x + 1, [1], workers=workers)) == [(1, 2)]
