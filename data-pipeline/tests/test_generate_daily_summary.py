"""scripts/generate_daily_summary.py — 갈림 문장의 개수 대조(PR #511).

저장된 갈림 문장 62개의 꼴로 맞춘 규칙이다. 맞는 문장은 빈 목록, 자리(초고온/상위)가 틀린
개수는 그 자리 이름과 함께 돌아온다.
"""
import pytest

from generate_daily_summary import balance_count_problems, balance_counts

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
