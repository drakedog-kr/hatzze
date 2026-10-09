"""지시문 누출 — 모델이 답 대신 작업 설명을 적은 문장(common/text_check.prompt_leaks)과 그걸 거르는 자리들.

2026-10-09 미장 급부상 1위 마벨 칸에 "…이를 22~30자 한 문장으로 담백하게 적습니다."(126자)가 실렸다.
영문 이름으로 시작해 '이름으로 시작 + ~습니다' 검사(10-08 AST 때 넣은 것)를 비켜갔다.
"""
import re
from pathlib import Path

from common.text_check import LEAK_WORDS, _LEAK_PATTERNS, drop_leak_sentences, leak_free, prompt_leaks

import generate_surging_oneliners as G
import generate_telegram_narratives as KR
from generate_theme_briefs import pick_text, riser_pick, talk_pick

LIB = Path(__file__).resolve().parents[2] / "lib"

MARVELL = (
    "Marvell 관련 화제가 주로 10/7 하루에 몰렸고, 발췌는 미국 장 강세와 마벨테크 +5.8% 상승, AI 실적 자신감, "
    "인베스터 데이 장기 AI 성장 전망을 언급합니다. 이를 22~30자 한 문장으로 담백하게 적습니다."
)
AST = "AST스페이스모바일 관련 화제는 위성 사업과 경쟁 우주기업 비교에 쏠려 있어 이를 담담하게 적습니다."


def test_catches_stored_leaks():
    """저장분에서 실제로 나온 꼴(10-08 · 10-09)."""
    for text in (
        MARVELL,
        AST,
        "KB금융은 언급이 가장 많았지만 발췌에서 내용은 확인되지 않습니다.",
        "이 기간 발췌 가운데 다른 행사나 상장, 편입 일정을 짚은 글은 눈에 띄지 않았습니다.",
        "삼성SDI와 포스코퓨처엠은 발췌에 이름만 나와 어떤 이야기가 돌았는지 확인되지 않습니다.",
    ):
        assert prompt_leaks(text), text


def test_leaves_ordinary_sentences():
    """저장분 7,990칸에서 오탐 0 이던 꼴들 — 비슷한 글자가 있어도 작업 설명이 아니다."""
    for text in (
        "올해 배당 물량이 적습니다.",  # 적다(few)
        "제3자배정 유상증자 공시가 주로 화제였습니다.",
        "2~3자 협의체 구성 소식",
        "이를 바탕으로 한 낙관적 평가가 지배적이었습니다.",
        "보고 사유는 단순투자로 적혔습니다.",
        "대출력 발전엔진과 SMR 주기기 생산시설 투자 소식",
        "감사원의 부당 지시 확인으로 최대주주 승인 취소 논의",
        "애널리스트 자료에서 ESS 관련 기업으로 언급되었습니다.",
    ):
        assert not prompt_leaks(text), text


def test_drop_leak_sentences_keeps_rest():
    brief = (
        "KB금융은 언급이 가장 많았지만 발췌에서 내용은 확인되지 않습니다. 미래에셋증권을 두고 스페이스X 평가손실 기사가 돌았습니다."
        "\n\n하나금융지주는 대량보유 공시가 화제였습니다."
    )
    assert drop_leak_sentences(brief) == (
        "미래에셋증권을 두고 스페이스X 평가손실 기사가 돌았습니다.\n\n하나금융지주는 대량보유 공시가 화제였습니다."
    )
    assert drop_leak_sentences("발췌에서 확인되지 않습니다.") == ""


def test_leak_free():
    ok = "위성 통신 기대 소식"
    assert leak_free([MARVELL, ok]) == [ok]
    assert leak_free([MARVELL]) == []
    assert leak_free(["발췌에는 신주 발행 내용이 담겼습니다. 알리바바 클라우드 매출 이야기가 돌았습니다."]) == [
        "알리바바 클라우드 매출 이야기가 돌았습니다."
    ]


# ── 급부상 한 줄 ─────────────────────────────────────────────────────────────


def test_answer_line_skips_plan_line():
    """첫 줄에 작업 설명, 다음 줄에 답 — 예전엔 첫 줄을 실었다."""
    assert G.answer_line(MARVELL + "\n\n인베스터 데이 장기 AI 성장 전망 소식") == "인베스터 데이 장기 AI 성장 전망 소식"
    assert G.answer_line('"광통신 수요 확대 기대"') == "광통신 수요 확대 기대"
    assert G.answer_line(MARVELL) == MARVELL  # 답이 없으면 첫 줄 — pick 이 버린다
    assert G.answer_line("") == ""


def test_pick_never_takes_leak_or_overlong():
    # 10-09 꼴: 다른 후보가 이름으로 시작한다고 뒤로 밀리면 누출이 뽑혔다.
    named = "마벨 인베스터 데이 AI 성장 전망 소식"
    assert G.pick([MARVELL, named], "인베스터 데이 AI 성장 전망", "마벨") == named
    assert G.pick([MARVELL], "인베스터 데이", "마벨") is None
    assert G.pick(["가" * (G.LEN_CEIL + 1)], "가", "마벨") is None


class _Resp:
    def __init__(self, text):
        self.content = [type("B", (), {"type": "text", "text": text})()]


class _Client:
    def __init__(self, replies):
        self.replies = list(replies)
        self.sent = []
        self.messages = self

    def create(self, **kw):
        self.sent.append(kw["messages"][0]["content"])
        return _Resp(self.replies.pop(0))


def test_ask_oneline_reasks_fresh_on_leak():
    """누출이면 방금 쓴 문장을 되먹이지 않고 처음 재료 그대로 다시 묻는다."""
    digest = "[종목] 마벨\n- 인베스터 데이 장기 AI 성장 전망"
    client = _Client([MARVELL, "인베스터 데이 장기 AI 성장 전망 소식"])
    assert G.ask_oneline(client, digest, "마벨") == "인베스터 데이 장기 AI 성장 전망 소식"
    assert client.sent == [digest, digest]


# ── 테마 요약 · 흐름 요약 ────────────────────────────────────────────────────


def test_theme_pickers_skip_leaks():
    talk_ok = "인공지능 서버 부품 공급 계약 소식"
    assert talk_pick(["발췌에 이름만 나와 확인되지 않음", talk_ok], "인공지능 서버 부품 공급 계약") == talk_ok
    assert talk_pick(["발췌에 이름만 나와 확인되지 않음"], "") is None
    assert riser_pick(["발췌에서 확인되지 않습니다."], "") is None
    brief = pick_text(["발췌에서 확인되지 않습니다.\n\n발췌에는 내용이 없습니다."], "")
    assert brief is None


def test_narrative_problems_and_pick():
    assert any("발췌" in p for p in KR.narrative_problems("발췌에서 내용은 확인되지 않습니다.", ""))
    assert KR.pick_narrative([MARVELL], "", "마벨") is None


# ── 화면 사본 ────────────────────────────────────────────────────────────────


def test_copy_matches_lib_source():
    """lib/prompt-leak.ts 의 낱말 · 꼴 · 상한이 이 원본과 같은가."""
    src = (LIB / "prompt-leak.ts").read_text()
    words = re.search(r"const LEAK_WORDS = \[(.*?)\];", src).group(1)
    assert tuple(re.findall(r'"([^"]+)"', words)) == LEAK_WORDS
    body = src[src.index("const LEAK_PATTERNS"):src.index("];", src.index("const LEAK_PATTERNS"))]
    assert re.findall(r"^\s*/(.+)/,$", body, re.M) == [p.pattern for p, _label in _LEAK_PATTERNS]
    assert int(re.search(r"export const ONELINER_CEIL = (\d+);", src).group(1)) == G.LEN_CEIL
