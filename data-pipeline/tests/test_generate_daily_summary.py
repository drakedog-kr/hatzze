"""scripts/generate_daily_summary.py — 갈림 문장의 개수 대조(PR #511).

저장된 갈림 문장 62개의 꼴로 맞춘 규칙이다. 맞는 문장은 빈 목록, 자리(초고온/상위)가 틀린
개수는 그 자리 이름과 함께 돌아온다.
"""
import pytest

from generate_daily_summary import (
    balance_count_problems,
    balance_counts,
    keep_bold,
    resting_spotlight,
    skipped_hotter,
    spotlight_name,
    spotlight_problems,
)

HOT = {"시장": 2, "감성": 1}
TOP = {"시장": 3, "감성": 2}


def test_wrong_hot_count_is_named_by_slot():
    text = "시장 지표가 더 뜨거우며, 초고온 구간에 시장지표 3개가 들었고 감성지표는 1개만 포진했으며, 상위 5개 안에서도 시장지표가 3개로 감성지표 2개를 앞서갑니다."
    assert balance_count_problems(text, HOT, TOP) == ["초고온 시장 3개"]


@pytest.mark.parametrize(
    "text, hot, top",
    [
        ("시장 지표가 더 뜨겁습니다. 초고온 구간에 시장 지표 2개가 감성 지표 1개보다 많이 들었으며, 상위 5개 안에서도 시장 지표 3개가 감성 지표 2개를 앞서고 있습니다.", HOT, TOP),
        ("시장 지표가 더 뜨겁습니다. 초고온 구간에는 두 종류가 각각 1개씩 들었으나 상위 5개 안에는 시장 지표 3개, 감성 지표 2개로 시장 쪽이 더 많이 자리 잡았습니다.", {"시장": 1, "감성": 1}, TOP),
        ("감성 지표 2개가 초고온 구간에 들었으나 시장 지표는 없으며, 시장 지표 3개가 상위 5개 안에 들어 있습니다.", {"시장": 0, "감성": 2}, TOP),
        ("감성지표가 더 뜨거운 상황으로, 초고온 구간의 4개 지표 중 감성지표가 2개를 차지하고 있으며 상위권에서도 감성지표의 과열도가 높습니다.", {"시장": 2, "감성": 2}, TOP),
        ("감성 지표가 시장 지표보다 더 뜨겁습니다. 초고온 구간에 감성 지표 2개가 들었으나 시장 지표는 0개이며, 상위 5개 안에서도 감성 지표가 2개로 시장 지표의 3개에 근접한 수준입니다.", {"시장": 0, "감성": 2}, TOP),
        ("두 종류가 비슷한 수준입니다.", HOT, TOP),
    ],
)
def test_correct_sentences_pass(text, hot, top):
    assert balance_count_problems(text, hot, top) == []


def test_bold_counts_are_still_checked():
    # Opus 5.5 가 실제로 쓴 꼴(2026-09-28). 별표가 `지표`와 숫자 사이에 끼어도 대조해야 한다.
    hot, top = {"시장": 0, "감성": 1}, {"시장": 2, "감성": 3}
    ok = "감성 지표가 시장 지표보다 조금 더 뜨겁습니다. 초고온에 든 지표는 감성 지표만 **1개**이고, 상위 5개 안에도 감성 지표가 **3개**, 시장 지표가 **2개** 들었습니다."
    assert balance_count_problems(ok, hot, top) == []
    bad = ok.replace("**3개**", "**2개**")
    assert balance_count_problems(bad, hot, top) == ["상위 감성 2개"]


def test_each_form_checks_both_kinds():
    text = "초고온 구간에는 두 종류가 각각 1개씩 들었으나 상위 5개 안에는 시장 지표 3개, 감성 지표 2개로 갈립니다."
    assert balance_count_problems(text, {"시장": 0, "감성": 1}, TOP) == ["초고온 각각 1개"]


def test_balance_counts_matches_the_digest_line():
    rows = [
        {"category": "시장", "hot": True},
        {"category": "감성", "hot": True},
        {"category": "시장", "hot": True},
        {"category": "시장", "hot": False},
        {"category": "감성", "hot": False},
        {"category": "감성", "hot": False},
    ]
    hot, top = balance_counts(rows)
    assert hot == {"시장": 2, "감성": 1}
    assert top == {"시장": 3, "감성": 2}


@pytest.mark.parametrize(
    "text, spans, want",
    [
        # Opus 5.5 가 실제로 쓴 꼴(2026-09-28) — ① 은 지표 이름만 남긴다.
        ("시장 지표 중 가장 뜨거운 **옵션 풋/콜 비율**은 과열도 **64%**로 높습니다.", 1,
         "시장 지표 중 가장 뜨거운 **옵션 풋/콜 비율**은 과열도 64%로 높습니다."),
        ("오늘은 **감성 지표**가 **시장 지표**보다 조금 더 뜨겁습니다. 초고온에는 **감성 지표 1개**만 들었습니다.", 0,
         "오늘은 감성 지표가 시장 지표보다 조금 더 뜨겁습니다. 초고온에는 감성 지표 1개만 들었습니다."),
        ("굵게가 없는 문장입니다.", 1, "굵게가 없는 문장입니다."),
        ("짝이 **안 맞는 별표입니다.", 1, "짝이 안 맞는 별표입니다."),
        ("", 0, ""),
    ],
)
def test_keep_bold(text, spans, want):
    assert keep_bold(text, spans) == want


NAMES = ["옵션 풋/콜 비율", "금 대비 코스피 상대강도", "최근 한 달 매매 안전장치 동향", "버핏지수", "코스피 상승 속도"]
PUTCALL = "**옵션 풋/콜 비율**은 콜옵션이 풋옵션보다 많을수록 높아지며, 과열도 64%로 시장 지표 중 가장 높습니다."
GOLD = "시장 지표 중 가장 뜨거운 **금 대비 코스피 상대강도**는 과열도 63%로 주식 쪽에 돈이 몰렸다는 뜻입니다."


def test_spotlight_name_prefers_bold_then_first_mention():
    assert spotlight_name(PUTCALL, NAMES) == "옵션 풋/콜 비율"
    # 굵게가 옛 이름이면 문장에 먼저 나오는 지금 이름으로
    assert spotlight_name("**깃헙 트레이딩봇 저장소 생성 수**와 금 대비 코스피 상대강도가 …", NAMES) == "금 대비 코스피 상대강도"
    assert spotlight_name("지표 이름이 없는 문장입니다.", NAMES) is None


def test_rests_only_after_three_same_days():
    # 최근 날부터
    assert resting_spotlight([PUTCALL, PUTCALL, PUTCALL, GOLD], NAMES) == "옵션 풋/콜 비율"
    assert resting_spotlight([PUTCALL, PUTCALL, GOLD, PUTCALL], NAMES) is None
    assert resting_spotlight([GOLD, PUTCALL, PUTCALL, PUTCALL], NAMES) is None  # 쉰 다음 날은 다시 나온다
    assert resting_spotlight([PUTCALL, PUTCALL], NAMES) is None  # 앞 날이 모자라면 안 센다
    assert resting_spotlight(["", "", ""], NAMES) is None  # 요약이 비었던 날은 안 센다


def _rows(rest_putcall=False):
    return [
        {"name": "경제 베스트셀러 비중", "category": "감성", "capped": 94.0, "slug": "a", "raw": 1, "rest": False},
        {"name": "옵션 풋/콜 비율", "category": "시장", "capped": 64.0, "slug": "b", "raw": 1, "rest": rest_putcall},
        {"name": "금 대비 코스피 상대강도", "category": "시장", "capped": 63.0, "slug": "c", "raw": 1, "rest": False},
        {"name": "버핏지수", "category": "시장", "capped": 58.0, "slug": "buffett_index", "raw": 180.0, "rest": False},
    ]


def test_skipped_hotter_names_the_next_pick_and_its_rank():
    assert skipped_hotter(_rows()) == (None, 0)
    pick, rank = skipped_hotter(_rows(rest_putcall=True))
    assert (pick["name"], rank) == ("금 대비 코스피 상대강도", 2)


def test_spotlight_problems():
    rested = _rows(rest_putcall=True)
    assert spotlight_problems(GOLD, rested) == ["'가장' 표현"]
    assert spotlight_problems(PUTCALL, rested) == ["쓰지 않을 지표 옵션 풋/콜 비율", "'가장' 표현"]
    ok = "**금 대비 코스피 상대강도**는 과열도 63%로 안전자산보다 주식에 돈이 몰렸다는 뜻입니다."
    assert spotlight_problems(ok, rested) == []
    # 보통 날엔 '가장'이 맞는 말이다. 문턱에 걸린 버핏지수 이름만 잡는다.
    assert spotlight_problems(PUTCALL, _rows()) == []
    assert spotlight_problems("버핏지수도 높은 편입니다.", _rows()) == ["쓰지 않을 지표 버핏지수"]
