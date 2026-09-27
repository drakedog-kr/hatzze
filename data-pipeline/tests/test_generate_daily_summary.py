"""scripts/generate_daily_summary.py — 갈림 문장의 개수 대조(PR #511).

저장된 갈림 문장 62개의 꼴로 맞춘 규칙이다. 맞는 문장은 빈 목록, 자리(초고온/상위)가 틀린
개수는 그 자리 이름과 함께 돌아온다.
"""
import pytest
from datetime import datetime, timezone

from generate_daily_summary import (
    CHANGE_NONE,
    brief_story,
    temp_gap,
    yeoron_problems,
    yeoron_tone,
    balance_count_problems,
    balance_counts,
    change_problems,
    hot_line_of,
    hot_problems,
    keep_bold_names,
    name_forms,
    pick_movers,
    resting_names,
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


NAMES = ["옵션 풋/콜 비율", "금 대비 코스피 상대강도", "경제 베스트셀러 비중", "버핏지수", "VKOSPI (변동성지수)"]


def test_name_forms_accept_short_and_unspaced():
    assert set(name_forms("VKOSPI (변동성지수)")) == {"VKOSPI (변동성지수)", "VKOSPI(변동성지수)", "VKOSPI"}
    assert name_forms("버핏지수") == ["버핏지수"]


def test_keep_bold_names_only():
    # Opus 가 실제로 쓴 꼴(2026-09-28) — 숫자·개수까지 굵게 쓴다. 지표 이름만 남긴다.
    text = "초고온은 **경제 베스트셀러 비중**(**94%**) 하나뿐이고 **감성 지표 1개**만 들었습니다. **VKOSPI**는 식었습니다."
    assert keep_bold_names(text, NAMES) == "초고온은 **경제 베스트셀러 비중**(94%) 하나뿐이고 감성 지표 1개만 들었습니다. **VKOSPI**는 식었습니다."
    assert keep_bold_names("짝이 **안 맞는 별표", NAMES) == "짝이 안 맞는 별표"


def test_hot_line_of_reads_new_and_old_rows():
    new = "[흐름] 23℃입니다.\n[달라진 것] …\n[뜨거운 곳] **경제 베스트셀러 비중**이 초고온입니다."
    assert hot_line_of(new) == "[뜨거운 곳] **경제 베스트셀러 비중**이 초고온입니다."
    # 옛 형식은 첫 줄(주인공 문단)이 같은 일을 했다
    assert hot_line_of("**옵션 풋/콜 비율**은 …\n감성 지표가 …\n지난주 …") == "**옵션 풋/콜 비율**은 …"
    assert hot_line_of(None) == ""


def test_rest_after_two_of_the_last_four_hot_lines():
    pc, gold, best = "**옵션 풋/콜 비율**", "**금 대비 코스피 상대강도**", "**경제 베스트셀러 비중**"
    # 최근 날부터. 한 줄에 둘을 부르면 둘 다 센다.
    assert resting_names([f"{best} · {pc}", best, gold, gold], NAMES) == {"경제 베스트셀러 비중", "금 대비 코스피 상대강도"}
    assert resting_names([pc, gold, best, "VKOSPI(변동성지수)"], NAMES) == set()
    # 다섯째 날 앞은 창 밖이다
    assert resting_names([gold, best, pc, gold, pc], NAMES) == {"금 대비 코스피 상대강도"}
    assert resting_names(["", ""], NAMES) == set()


def _row(name, cat, capped, rest=False, slug="x", raw=1.0):
    return {"name": name, "category": cat, "capped": capped, "hot": capped >= 75, "rest": rest, "slug": slug, "raw": raw}


def test_hot_problems():
    rows = [_row("경제 베스트셀러 비중", "감성", 94, rest=True), _row("옵션 풋/콜 비율", "시장", 64), _row("버핏지수", "시장", 58, slug="buffett_index", raw=180)]
    hot, top = balance_counts(rows)
    ok = "초고온에는 감성 지표 1개만 들었고, **옵션 풋/콜 비율**이 시장 지표 중 64%입니다."
    assert hot_problems(ok, rows, hot, top) == []
    assert hot_problems("**경제 베스트셀러 비중**이 94%로 초고온입니다.", rows, hot, top) == ["쓰지 않을 지표 경제 베스트셀러 비중"]
    # 가장 뜨거운 지표가 쉬는 날 다른 지표를 '가장 높은'이라 부르면 거짓
    assert hot_problems("**옵션 풋/콜 비율**이 가장 높은 64%입니다.", rows, hot, top) == ["'가장' 표현"]
    # 개수도 대조한다(굵게 써도)
    assert hot_problems("초고온에는 감성 지표 **2개**가 들었습니다.", rows, hot, top) == ["초고온 감성 2개"]
    # 자료 안쪽 말(Opus 가 실제로 쓴 꼴, 2026-09-28)
    assert hot_problems("표시 없는 지표 중에서는 **옵션 풋/콜 비율**이 64%입니다.", rows, hot, top) == ["안쪽 말"]


def test_change_problems_only_listed_names():
    movers = {"경제 베스트셀러 비중"}
    assert change_problems("**경제 베스트셀러 비중**이 더 뜨거워졌습니다.", movers, NAMES) == []
    assert change_problems("**버핏지수**도 올랐습니다.", movers, NAMES) == ["목록 밖 지표 버핏지수"]


NOW = datetime(2026, 9, 27, 12, 0, tzinfo=timezone.utc)
FRESH = "2026-09-27T10:34:00+00:00"
STALE = "2026-09-26T08:00:00+00:00"
JUMPY = [10, 11, 10, 11, 10, 11, 10, 11, 16]  # 평소 ±1, 마지막 +5(평소의 5배)


def _mv(name, values, direction="high", created=FRESH):
    return {"name": name, "category": "감성", "direction": direction, "values": values, "created_at": created}


def test_pick_movers_ranks_by_usual_move():
    got = pick_movers([_mv("a", JUMPY), _mv("b", [10, 11, 10, 11, 10, 11, 10, 11, 12.5]), _mv("c", [10, 11, 10, 11, 10, 11, 10, 11, 13])], NOW)
    assert [(m["name"], m["times"]) for m in got] == [("a", 5.0), ("c", 2.0)]


def test_pick_movers_heat_direction_and_freshness():
    assert pick_movers([_mv("v", JUMPY, direction="low")], NOW)[0]["hotter"] is False
    # 하루 넘게 묵은 값(하루 늦게 오는 지표가 같은 변화를 이틀 드는 경우)은 안 본다
    assert pick_movers([_mv("a", JUMPY, created=STALE), _mv("b", JUMPY, created=None)], NOW) == []


def test_pick_movers_sparse_indicator_uses_mean():
    # 베스트셀러 비중처럼 정수로 가끔 바뀐다. 직전 15번 변화 중 1 이 4번 → 평균 4/15, 마지막 1 → 3.75배
    got = pick_movers([_mv("best", [5, 5, 5, 6, 6, 6, 5, 5, 5, 5, 6, 6, 6, 6, 5, 5, 6])], NOW)
    assert len(got) == 1 and abs(got[0]["times"] - 15 / 4) < 1e-9


def test_change_none_is_a_sentence():
    assert CHANGE_NONE.endswith("습니다.")


def _sent(d, pos, neg, n):
    return {"date": d, "scope": "overall", "positive_count": pos, "negative_count": neg, "message_count": n}


def test_yeoron_tone_uses_kadera_window():
    # 오늘+어제가 2,000건을 넘으면 둘만 본다 — 사흘 전의 낙관은 안 들어간다(카더라 히어로와 같은 창).
    rows = [_sent("2026-09-27", 300, 300, 1200), _sent("2026-09-26", 300, 300, 1200), _sent("2026-09-25", 900, 100, 1200)]
    assert yeoron_tone(rows, "2026-09-27") == "중립"
    # 표본이 얇으면 하루씩 넓힌다
    thin = [_sent("2026-09-27", 300, 300, 600), _sent("2026-09-26", 300, 300, 600), _sent("2026-09-25", 900, 100, 1200)]
    assert yeoron_tone(thin, "2026-09-27") == "낙관 우세"
    assert yeoron_tone([], "2026-09-27") is None


def test_brief_story_is_second_paragraph():
    assert brief_story("분위기 대목입니다.\n\n테마 대목입니다.\n\n뉴스 대목입니다.") == "테마 대목입니다."
    assert brief_story("한 대목뿐") == ""
    assert brief_story(None) == ""


def test_temp_gap_only_when_they_disagree():
    assert temp_gap("저온", "낙관 우세") == "시장 온도는 저온인데 여론은 낙관이 우세합니다."
    assert temp_gap("초고온", "비관 우세") == "시장 온도는 초고온인데 여론은 비관이 우세합니다."
    assert temp_gap("저온", "중립") is None
    assert temp_gap("상온", "낙관 우세") is None


def test_yeoron_problems():
    ok = "카더라에서는 낙관과 비관이 팽팽하고, 사흘 전엔 거의 없던 HBM 이야기가 새로 올라왔습니다."
    assert yeoron_problems(ok, "중립", NAMES) == []
    assert yeoron_problems("카더라에서는 낙관이 우세하고 HBM 이야기가 늘었습니다.", "중립", NAMES) == ["분위기 낙관 우세"]
    assert yeoron_problems("카더라에서는 낙관과 비관이 팽팽하고 글이 496건 올라왔습니다.", "중립", NAMES) == ["숫자"]
    assert yeoron_problems("카더라 총평에 따르면 낙관과 비관이 팽팽합니다.", "중립", NAMES) == ["안쪽 말"]
    assert yeoron_problems("카더라에서는 낙관과 비관이 팽팽하고 **옵션 풋/콜 비율** 이야기가 많습니다.", "중립", NAMES) == ["지표 이름"]
