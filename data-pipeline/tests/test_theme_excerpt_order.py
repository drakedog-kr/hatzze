"""테마 요약 · 도는 얘기 발췌 차례 — 목록 글(종목 여섯 넘게 태그)을 뒤로, 짧은 감상은 모자랄 때만(2026-10-15 점검)."""
import generate_theme_briefs as TB


def _msg(i: int, text: str, views: int) -> dict:
    return {"channel_handle": "ch", "message_id": i, "text": text, "views": views, "forwards": 0, "posted_at": "2026-10-15T00:00:00+00:00"}


def test_list_post_threshold():
    assert TB.list_post(TB.RELATED_MAX_TAGS + 1)
    assert not TB.list_post(TB.RELATED_MAX_TAGS)


def test_pick_excerpts_puts_short_last_and_dedupes():
    long_a = "포스코인터내셔널이 LNG 화물창 기술 국산화 사업에 참여한다는 소식이 전해졌다는 글"
    long_b = "탄자니아 마헨게 흑연 광산 지분 확대와 음극재 공급망 구축 계획을 다룬 기사 요약"
    short = "오늘 좋네요"
    got = TB.pick_excerpts([short, long_a, long_a, long_b], lambda t: t, 3)
    assert got == [long_a, long_b, short]
    assert TB.pick_excerpts([short, long_a], lambda t: t, 1) == [long_a]


def test_talk_blocks_puts_list_posts_after():
    listing = _msg(1, "실적 추정치 상향 종목 목록 — " + " · ".join(f"종목{i}" for i in range(12)) + " 포스코인터내셔널", 90_000)
    story = _msg(2, "포스코인터내셔널, LNG 화물창 기술 국산화 사업 참여 소식이 돌았다", 3_000)
    tags = {1: 12, 2: 3}
    pool = {"047050": [(listing, "포스코인터내셔널"), (story, "포스코인터내셔널")]}
    out = TB.talk_blocks(pool, ["047050"], tags_of=lambda m: tags[m["message_id"]])
    first = out["047050"].splitlines()[0]
    assert "LNG 화물창" in first
    # tags_of 를 안 주면 예전처럼 퍼짐 순이다.
    assert "목록" in TB.talk_blocks(pool, ["047050"])["047050"].splitlines()[0]
