"""급부상 유령 감시(check_phantom_stocks)의 판정 함수. DB 는 부르지 않는다.

사례 본문은 실제 코퍼스의 문장이다. 근거와 되돌려 잰 수치는 scripts/check_phantom_stocks.py 문두(⑤ 절 · 판정 기록 절).
"""
import pytest

from check_phantom_stocks import (
    TRACE_MAX_MENTIONS,
    already_judged,
    assess,
    cluster_of,
    load_judged,
    mark_traces,
)
from extract_telegram_stocks import build_pattern

DAEGYO = {"대교": "019680"}
CHEONBO = {"천보": "278280"}


def _tagger(match_to_code: dict[str, str]) -> tuple:
    pattern, caseless = build_pattern(list(match_to_code))
    return pattern, match_to_code, {k: "dict" for k in match_to_code}, set(match_to_code), caseless


def _mentions(match: str, texts: list[str]) -> list[dict]:
    return [{"channel": f"ch{i}", "match": match, "text": t, "date": "2026-10-06"} for i, t in enumerate(texts)]


# 2026-10-04~06 창의 대교 5건(PR #668 이전 규칙). 다리 기사 3 · DART 2.
DAEGYO_WINDOW = [
    "우크라이나 키이우의 드니프로강을 가로지르는 북부 대교를 러시아의 S8000 반데롤 순항 미사일이 타격하는 장면",
    "📺 미국 주식 인사이더 🇺🇸 (US Stocks Insider)\n📝 우크라이나 키이우의 드니프로강을 가로지르는 북부 대교를 러시아의 S800...",
    "북·중 수교 기념일 개통설은 실현되지 않았지만 대교 주변 시설 정비와 차량 이동 등 준비 움직임이 관측되고 있다.",
    "(유가)대교 - 주요사항보고서(자기주식처분결정)",
    "2026.10.06 14:52:54\n기업명: 대교(시가총액: 653억) A019680\n보고서명: 주요사항보고서(자기주식처분결정)",
]
# 같은 창의 천보 3건 — 하나증권 2차전지 주간 한 편이 세 채널에 실렸다(진짜).
CHEONBO_TEXT = (
    "한편, 포스코퓨처엠(+3.9%), 에코프로비엠(10.2%), 천보(+9.5%) 등 양극재 및 기타 소재 업체들도 "
    "대형주 호실적 기대감에 주가 동반 상승했다."
)


def test_mentions_without_stock_marks_ring_on_a_small_risky_card():
    ms = _mentions("대교", DAEGYO_WINDOW)
    mark_traces("019680", ms, _tagger(DAEGYO))
    r = assess("019680", "대교", ms)
    assert r["traced"] == 1
    assert r["dup"] < 0.8  # ①② 로는 조용했다
    assert r["reasons"] == ["흔적 1/5"]


def test_copied_research_with_price_marks_does_not_ring_by_traces():
    ms = _mentions("천보", [CHEONBO_TEXT] * 3)
    mark_traces("278280", ms, _tagger(CHEONBO))
    r = assess("278280", "천보", ms)
    assert r["traced"] == 3
    assert r["reasons"] == ["복붙 지배 100%"]  # 이건 ① 이 울린다 — 판정 기록이 막는다(아래)


def test_trace_signal_stays_quiet_above_the_mention_cap():
    # 인기 종목은 대화 글이 흔적 없이 부른다(LG 17% · 태웅 29%). 상한 위에서는 ⑤ 를 재지 않는다.
    texts = [f"대교 이야기 {i}번째 글입니다" for i in range(TRACE_MAX_MENTIONS + 1)]
    ms = _mentions("대교", texts)
    mark_traces("019680", ms, _tagger(DAEGYO))
    assert assess("019680", "대교", ms)["reasons"] == []


def test_trace_signal_needs_traces_to_be_marked():
    # mark_traces 를 거치지 않은 언급(되돌려 재기에서 추출기를 안 넘긴 경우)으로는 ⑤ 를 재지 않는다.
    r = assess("019680", "대교", _mentions("대교", DAEGYO_WINDOW))
    assert r["traced"] is None
    assert r["reasons"] == []


def test_judged_clusters_come_only_from_issues_closed_as_not_planned():
    h = cluster_of(CHEONBO_TEXT)
    issues = [
        {"stateReason": "NOT_PLANNED", "body": "- 천보(278280): 복붙 지배 100% · 매칭 천보", "comments": [
            {"body": f"진짜로 판정했습니다.\n- 천보(278280): 복붙 지배 100% · 매칭 천보 · 묶음 {h}"},
        ]},
        {"stateReason": "COMPLETED", "body": "- 디바이스(187870): 복붙 지배 100% · 매칭 디바이스 · 묶음 0123abcd+4567cdef"},
        {"stateReason": "NOT_PLANNED", "body": "- 인벤테라(0007J0): 흔적 0/3 · 매칭 인벤테라 · 묶음 aaaaaaaa+bbbbbbbb"},
    ]
    judged = load_judged(issues)
    assert judged == {"278280": {h}, "0007J0": {"aaaaaaaa", "bbbbbbbb"}}


def test_a_judged_card_is_quiet_until_a_new_text_joins():
    h = cluster_of(CHEONBO_TEXT)
    judged = {"278280": {h}}
    same = assess("278280", "천보", _mentions("천보", [CHEONBO_TEXT] * 3))
    assert already_judged(same, judged)
    grown = assess("278280", "천보", _mentions("천보", [CHEONBO_TEXT] * 3 + ["천보 오늘 왜 이래"]))
    assert not already_judged(grown, judged)
    assert not already_judged(same, {})


@pytest.mark.parametrize("text", [CHEONBO_TEXT, CHEONBO_TEXT + "\n\nhttps://t.me/x/1", "  " + CHEONBO_TEXT.replace(" ", "  ")])
def test_cluster_ignores_links_and_spacing(text):
    # 채널마다 꼬리 링크·공백이 달라도 같은 묶음이어야 판정 기록이 다음 실행에도 맞는다.
    assert cluster_of(text) == cluster_of(CHEONBO_TEXT)
