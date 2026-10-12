"""총평 넷째 대목(일정)의 재료 — 일정 블록이 **실제로** 있는 날만 넷째 대목을 부르나(has_schedule_block).

셋째 대목 발췌 옆 주의(NEWS_SCHEDULE_NOTE)가 블록 이름 '오간 앞으로의 일정'을 품고 있어서, 이름이
digest 에 들어 있나로 보면 일정 발췌가 없는 날에도 참이 된다. 국장·미장이 같은 판정을 쓴다.
"""
from datetime import date

import generate_telegram_narratives as KR

# 셋째 대목 재료 — build_news_block(국장)·build_brief_digest(미장)가 발췌 뒤에 늘 주의를 붙인다.
NEWS = "\n".join(
    [
        "",
        "[09-26~09-28 오간 이야기] 조회·확산 상위 6건 (표본 120건)",
        "- 삼성전자 HBM4 퀄 통과 소식에 반도체 강세",
        KR.NEWS_SCHEDULE_NOTE,
        "[09-26~09-28 화제 종목] 삼성전자 120회 · SK하이닉스 80회",
    ]
)


def test_news_note_alone_is_not_schedule_material():
    # 일정 조회가 시간 초과로 []를 낸 날의 digest. 이름은 주의 문장 안에 있다.
    assert KR.SCHEDULE_BLOCK_HEAD in NEWS
    assert KR.schedule_digest(NEWS) == ""
    assert not KR.has_schedule_block(NEWS)


def test_real_block_is_schedule_material():
    for span in ("오늘", "09-26~09-28"):
        block = KR.schedule_lines(["에이스테크 10월 2일 상장 예정"], span)
        digest = NEWS + "\n".join(block)
        assert KR.has_schedule_block(digest)
        assert KR.schedule_digest(digest).startswith(f"[{span} {KR.SCHEDULE_BLOCK_HEAD}]")


def test_gate_and_material_agree():
    # 판정이 참이면 넷째 대목에 넘길 재료가 비어 있지 않아야 한다 — 빈 재료로 부르면 API 가 거절한다.
    for digest in (NEWS, NEWS + "\n".join(KR.schedule_lines(["삼성전자 10월 7일 잠정실적 발표 예정"], "오늘"))):
        assert KR.has_schedule_block(digest) == bool(KR.schedule_digest(digest))


# ── 일정 발췌를 고르는 판정(schedule_hit) ─────────────────────────────────────
# 월·일만 적힌 날짜는 **기준일 이후 처음 오는 그날**로 읽는다. 9월 말부터는 120일 창이 해를
# 넘어서 schedule_prefilter 가 이듬해 달 이름까지 받아 오는데, 해를 기준일 해로 못박으면
# 그 일정이 전부 '지난 날'로 버려졌다. 미장도 같은 함수를 쓴다.


def test_next_year_month_day_is_upcoming():
    for base in (date(2026, 9, 29), date(2026, 12, 1)):
        assert "text.ilike.*1월*" in KR.schedule_prefilter(base)
        assert KR.schedule_hit("삼성전자 1월 7일 CES 2027 신제품 공개 예정", base)
        assert KR.schedule_hit("LG에너지솔루션 1월 22일 잠정실적 발표 예정", base)
    # 윤년에만 있는 날은 그날이 있는 해로 넘어간다.
    assert KR.schedule_hit("셀트리온 2월 29일 주주총회 예정", date(2027, 12, 1))


def test_passed_or_far_month_day_is_not_upcoming():
    base = date(2026, 9, 29)
    assert KR.schedule_hit("현대차 12월 10일 신제품 출시 예정", base)
    # 어제 날짜는 내년으로 넘겨도 SCHEDULE_LOOKAHEAD_DAYS 밖이다.
    assert not KR.schedule_hit("현대차 9월 28일 신제품 출시 예정", base)
    # 옛 기사의 '3월 5일' — 내년 3월 5일도 창 밖이라 앞날로 안 친다.
    assert not KR.schedule_hit("삼성전자 3월 5일 신제품 공개 예정", base)


def test_later_upcoming_date_is_not_hidden_by_a_passed_one():
    # 글머리의 지난 날짜가 뒤에 적힌 일정을 가리지 않는다.
    text = "9월 28일 마감 시황 정리 … 에이스테크 10월 2일 상장 예정 공모"
    assert KR.schedule_hit(text, date(2026, 9, 29))


def test_dart_date_field_decides():
    base = date(2026, 9, 29)
    assert KR.schedule_hit("기업명: SKC 잠정실적 발표 예정일자 : 2026-11-24", base)
    assert not KR.schedule_hit("기업명: SKC 잠정실적 발표 예정일자 : 2026-09-20", base)
    # 공시가 못박은 날짜가 있으면 본문의 다른 월·일보다 그것을 믿는다.
    assert not KR.schedule_hit("기업명: SKC 잠정실적 발표 예정일자 : 2026-09-20 (10월 2일 정정)", base)


# ── 넷째 대목이 일정을 썼나(schedule_like) ────────────────────────────────────
# 채널 글이 월 없이 "14일 ASML이…"라고 쓰면 모델도 그대로 옮긴다. 맨 날짜를 안 받던 때는
# 그런 일정 문단을 두 번 다 버려 2026-10-12 미장 총평이 세 대목으로 저장됐다(_SCHED_MARK 주석).


def test_day_without_month_is_schedule():
    # 10-12 · 10-03 미장 실행이 버린 첫 시도.
    assert KR.schedule_like("14일 ASML, 15일 TSMC 실적 발표를 두고 말이 오갔고, 이번 주 9월 소비자물가지수도 나옵니다.")
    assert KR.schedule_like("마이크론 컨퍼런스콜에서 12월부터 주주환원을 늘리고 자사주 추가 매입 승인도 추진한다는 말이 돌았습니다.")
    assert KR.schedule_like("14일엔 ASML, 16일까지는 소매판매 발표가 이어진다는 글이 돌았습니다.")
    assert KR.schedule_like("12~16일 CPI와 PPI가 차례로 나옵니다.")


def test_period_is_not_schedule():
    # 첫째·둘째 대목이 기간을 말하는 꼴 — 넷째 대목이 이걸 되풀이하면 버려야 한다.
    assert not KR.schedule_like("최근 3일간 미국 종목에 대한 낙관도가 76%로 우세를 유지했습니다.")
    assert not KR.schedule_like("최근 3일 미국 종목 관련 이야기에서 낙관이 우세했습니다.")
    assert not KR.schedule_like("앞 3일엔 거의 없던 HBM 이야기가 올라왔습니다.")
    assert not KR.schedule_like("3일 전엔 거의 없던 FOMC 이야기가 늘었습니다.")
    assert not KR.schedule_like("지난 3일 동안 반도체 이야기가 가장 많았습니다.")


def test_brief_body_picks_schedule_paragraph_with_bare_day():
    # 모델이 총평을 통째로 보내면 넷째 대목은 일정 표지가 있는 마지막 문단을 집는다(brief_body 주석).
    whole = "최근 3일 낙관도는 80%입니다.\n\nAI반도체가 가장 많았습니다.\n\n14일 ASML, 15일 TSMC가 실적을 냅니다."
    assert KR.brief_body(whole, "schedule") == "14일 ASML, 15일 TSMC가 실적을 냅니다."
