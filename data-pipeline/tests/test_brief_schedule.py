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
