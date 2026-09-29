"""총평 넷째 대목(일정)의 재료 — 일정 블록이 **실제로** 있는 날만 넷째 대목을 부르나(has_schedule_block).

셋째 대목 발췌 옆 주의(NEWS_SCHEDULE_NOTE)가 블록 이름 '오간 앞으로의 일정'을 품고 있어서, 이름이
digest 에 들어 있나로 보면 일정 발췌가 없는 날에도 참이 된다. 국장·미장이 같은 판정을 쓴다.
"""
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
