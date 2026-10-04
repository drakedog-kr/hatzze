"""common/keyword_overlap — 이슈 키워드 열 칸이 같은 화제를 두 번 세우지 않는다(2026-10-04 데이터센터 · AI데이터센터 · AI)."""
from common.keyword_overlap import drop_overlaps


def test_contained_pair_keeps_the_higher_one():
    assert drop_overlaps(["실적호조", "데이터센터", "AI데이터센터", "금리", "AI"]) == ["실적호조", "데이터센터", "금리"]


def test_longer_first_drops_shorter():
    assert drop_overlaps(["AI 데이터센터", "데이터센터", "수주"]) == ["AI 데이터센터", "수주"]


def test_unrelated_words_stay():
    assert drop_overlaps(["HBM", "금리인상", "환율"]) == ["HBM", "금리인상", "환율"]
