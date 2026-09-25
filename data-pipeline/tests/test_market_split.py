"""국장 카더라의 '미장 글' 가르기 — common/market_tags 와 총평 발췌 고르기(choose_excerpts)."""
from common.market_tags import KR_TAGS, is_kr_led, is_us_only, tag_counts
from generate_telegram_narratives import choose_excerpts


def test_us_only_is_us_tags_without_kr():
    assert is_us_only(0, 1)
    assert not is_us_only(1, 3)  # 'SK하이닉스·AMD 에 베팅' 은 국장 이야기이기도 하다
    assert not is_us_only(0, 0)  # 태그 없는 시황·금리 글은 남긴다


def test_kr_led_needs_kr_at_least_us():
    assert is_kr_led(1, 0)
    assert is_kr_led(2, 2)
    assert not is_kr_led(1, 44)  # 미국 시황 정리('*특징 종목')는 먼저 싣지 않는다
    assert not is_kr_led(0, 0)


def msg(text, views, fwd=0):
    return {"text": text, "views": views, "forwards": fwd}


def test_first_slots_then_rest_by_reach():
    first = [msg("국내1", 50), msg("국내2", 40), msg("국내3", 30)]
    rest = [msg("시장1", 900), msg("시장2", 800), msg("시장3", 700)]
    got = choose_excerpts(first, rest, n=4, first_slots=2)
    assert [m["text"] for m in got] == ["시장1", "시장2", "국내1", "국내2"]


def test_rest_short_is_filled_from_first():
    first = [msg("국내1", 50), msg("국내2", 40), msg("국내3", 30)]
    got = choose_excerpts(first, [msg("시장1", 900)], n=4, first_slots=2)
    assert [m["text"] for m in got] == ["시장1", "국내1", "국내2", "국내3"]


def test_blank_and_copied_bodies_are_skipped():
    same = "Meta의 AI 에이전트 Muse 는 출시 이후 " * 3
    rest = [msg(same, 900), msg("  ", 850), msg(same + " 꼬리만 다름", 800), msg("시장2", 10)]
    got = choose_excerpts([], rest, n=6, first_slots=4)
    assert [m["views"] for m in got] == [900, 10]


class FakeTable:
    def __init__(self, rows):
        self.rows, self.ids, self.lo, self.hi = rows, None, 0, None

    def select(self, _):
        return self

    def in_(self, _col, ids):
        self.ids = set(ids)
        return self

    def order(self, _):
        return self

    def range(self, lo, hi):
        self.lo, self.hi = lo, hi
        return self

    def execute(self):
        hit = [r for r in self.rows if r["message_id"] in self.ids]
        return type("R", (), {"data": hit[self.lo : self.hi + 1]})()


class FakeDB:
    def __init__(self, rows):
        self.rows = rows

    def table(self, _):
        return FakeTable(self.rows)


def test_tag_counts_pairs_channel_and_id():
    rows = [
        {"channel_handle": "a", "message_id": 7, "stock_code": "000660"},
        {"channel_handle": "a", "message_id": 7, "stock_code": "000660"},  # 같은 종목이 두 번
        {"channel_handle": "a", "message_id": 7, "stock_code": "005930"},
        {"channel_handle": "b", "message_id": 7, "stock_code": "035420"},  # 번호만 같은 남의 채널
    ]
    assert tag_counts(FakeDB(rows), KR_TAGS, [("a", 7), ("c", 7)]) == {("a", 7): 2}
