"""scripts/generate_daily_summary.py — 갈림 문장의 개수 대조(PR #511).

저장된 갈림 문장 62개의 꼴로 맞춘 규칙이다. 맞는 문장은 빈 목록, 자리(초고온/상위)가 틀린
개수는 그 자리 이름과 함께 돌아온다.
"""
import pytest
from datetime import datetime, timezone

from generate_daily_summary import (
    CHANGE_NONE,
    LINE_MAX,
    change_fallback,
    change_line_of,
    change_streak_names,
    hot_fallback,
    brief_story,
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
    # 전체 1등은 쉬지 않아도 시장 지표 1등이 쉬면 '시장에서 가장 높은'도 거짓이다(Haiku 가 실제로 쓴 꼴)
    rows2 = [_row("경제 베스트셀러 비중", "감성", 94), _row("옵션 풋/콜 비율", "시장", 64, rest=True), _row("금 대비 코스피 상대강도", "시장", 63)]
    h2, t2 = balance_counts(rows2)
    assert hot_problems("시장에서는 **금 대비 코스피 상대강도**가 가장 높습니다.", rows2, h2, t2) == ["'가장' 표현"]
    # 활용형도 잡는다 — "가장 뜨겁습니다"는 '뜨거'가 아니라 '뜨겁'이라 옛 정규식을 빠져나갔다(Haiku, 09-28)
    assert hot_problems("시장 지표 중에는 **금 대비 코스피 상대강도**가 가장 뜨겁습니다.", rows2, h2, t2) == ["'가장' 표현"]
    assert hot_problems("시장에서는 **금 대비 코스피 상대강도**가 가장 과열돼 있습니다.", rows2, h2, t2) == ["'가장' 표현"]
    # '가장 식은'은 1등 주장이 아니지만, 뜨거운 곳 줄은 식은 지표를 말하지 않는다(2026-10-08 운영자 지시)
    assert hot_problems("시장 지표 가운데 가장 식은 쪽은 **금 대비 코스피 상대강도**입니다.", rows2, h2, t2) == ["식은 지표 표현"]
    # 아무것도 안 쉬면 '가장'은 맞는 말이다
    rows3 = [dict(r, rest=False) for r in rows2]
    h3, t3 = balance_counts(rows3)
    assert hot_problems("**경제 베스트셀러 비중**이 가장 높습니다.", rows3, h3, t3) == []
    # 10-03 에 실제로 나간 꼴 — 뜨거운 지표 뒤에 식은 시장 지표를 붙였다
    two = "**경제 베스트셀러 비중**이 94%로 초고온이고, **옵션 풋/콜 비율**은 과열도 0%로 식어 있습니다."
    assert hot_problems(two, rows3, h3, t3) == ["지표 둘 이상", "식은 지표 표현"]
    # 낱말 속 '식은'(인식은)은 걸리지 않는다
    assert hot_problems("**경제 베스트셀러 비중**이 94%로 초고온이라 재테크 인식은 뜨겁습니다.", rows3, h3, t3) == []
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


def test_yeoron_problems():
    ok = "카더라에서는 낙관과 비관이 팽팽하고, 사흘 전엔 거의 없던 HBM 이야기가 새로 올라왔습니다."
    assert yeoron_problems(ok, "중립", NAMES) == []
    assert yeoron_problems("카더라에서는 낙관이 우세하고 HBM 이야기가 늘었습니다.", "중립", NAMES) == ["분위기 낙관 우세"]
    assert yeoron_problems("카더라에서는 낙관과 비관이 팽팽하고 글이 496건 올라왔습니다.", "중립", NAMES) == ["숫자"]
    assert yeoron_problems("카더라 총평에 따르면 낙관과 비관이 팽팽합니다.", "중립", NAMES) == ["안쪽 말"]
    assert yeoron_problems("카더라에서는 낙관과 비관이 팽팽하고 **옵션 풋/콜 비율** 이야기가 많습니다.", "중립", NAMES) == ["지표 이름"]


def test_hot_fallback_is_true_and_josa_free():
    rows = [_row("경제 베스트셀러 비중", "감성", 94), _row("옵션 풋/콜 비율", "시장", 64, rest=True),
            _row("금 대비 코스피 상대강도", "시장", 63), _row("코스피 상승 속도", "시장", 0), _row("고점권 외국인 매도", "시장", 0)]
    hot, top = balance_counts(rows)
    s = hot_fallback(rows, hot)
    # 한 곳만 — 식은 시장 지표는 안 적는다(2026-10-04 '뜨거운 곳' 한 줄).
    assert s == "초고온에 든 지표는 **경제 베스트셀러 비중**(과열도 94) 하나입니다."
    assert hot_problems(s, rows, hot, top) == []
    # 초고온 지표가 쉬면 종류와 개수로
    rested = [dict(r, rest=(r["name"] == "경제 베스트셀러 비중")) for r in rows]
    h2, t2 = balance_counts(rested)
    s2 = hot_fallback(rested, h2)
    assert s2 == "초고온에는 감성 지표 1개가 들었습니다."
    assert hot_problems(s2, rested, h2, t2) == []


def test_hot_fallback_no_hot_names_top_only_when_true():
    rows = [_row("금 대비 코스피 상대강도", "시장", 63), _row("코스피 상승 속도", "시장", 0)]
    hot, top = balance_counts(rows)
    assert hot_fallback(rows, hot).startswith("초고온에 든 지표는 없고 과열도가 가장 높은 지표는 **금 대비 코스피 상대강도**(과열도 63)입니다.")
    # 1등이 쉬면 '가장'을 안 붙인다
    rows = [_row("옵션 풋/콜 비율", "시장", 64, rest=True)] + rows
    hot, top = balance_counts(rows)
    s = hot_fallback(rows, hot)
    assert s.startswith("초고온에 든 지표는 없습니다.")
    assert hot_problems(s, rows, hot, top) == []


def test_hot_fallback_names_one_of_many():
    rows = [_row("코인 투자 과열 지수", "감성", 78), _row("경제 베스트셀러 비중", "감성", 76), _row("코스피 상승 속도", "시장", 0)]
    hot, top = balance_counts(rows)
    s = hot_fallback(rows, hot)
    assert s == "초고온에 든 지표 2개 가운데 하나는 **코인 투자 과열 지수**(과열도 78)입니다."
    assert hot_problems(s, rows, hot, top) == []


def test_change_fallback_lists_movers():
    got = change_fallback([{"name": "경제뉴스 감성 지수", "hotter": True}, {"name": "VKOSPI (변동성지수)", "hotter": False}])
    assert got == "최근 하루 평소보다 크게 움직인 지표는 **경제뉴스 감성 지수**(더 뜨거워짐) · **VKOSPI (변동성지수)**(식음)입니다."
    # 셋이면 앞의 둘만 — 한 줄(LINE_MAX)에 들게.
    three = change_fallback([{"name": "경제뉴스 감성 지수", "hotter": True}, {"name": "VKOSPI (변동성지수)", "hotter": False}, {"name": "버핏지수", "hotter": True}])
    assert three == got and len(three.replace("**", "")) <= LINE_MAX


def test_change_streak_rests_name_seen_two_days_in_row():
    # 09-30 · 10-01 · 10-02 사흘 연속 '코스피 신고가 대비 괴리율'이 섰다 — 앞 이틀 연속이면 오늘 뺀다.
    names = ["코스피 신고가 대비 괴리율", "증권 앱 인기차트 순위", "버핏지수"]
    d1 = "[달라진 것] **버핏지수**와 **코스피 신고가 대비 괴리율**이 하루 새 크게 과열 쪽으로 움직였습니다."
    d2 = "[달라진 것] **코스피 신고가 대비 괴리율**이 더 뜨거워졌고 **증권 앱 인기차트 순위**도 과열 쪽으로 움직였습니다."
    assert change_line_of("[흐름] …\n" + d1 + "\n[뜨거운 곳] …") == d1
    assert change_streak_names([d1, d2], names) == {"코스피 신고가 대비 괴리율"}
    # 하루라도 끊겼으면(요약 없는 날 · 안 나온 날) 쉬지 않는다.
    assert change_streak_names([d1, ""], names) == set()
    assert change_streak_names([d1], names) == set()

