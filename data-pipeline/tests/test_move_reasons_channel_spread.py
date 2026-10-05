"""등락 이유 발췌는 채널을 고루(generate_move_reasons.spread_by_channel).

리노공업 10/1 의 이유가 18채널 중 한 곳 글의 '노조 총파업 중단'으로 섰다(2026-10-04 점검) — 한 채널 글이 여럿 들어
그 채널 말이 다수처럼 읽혔다.
"""
import generate_move_reasons as mr


def _m(ch: str, i: int):
    return ({"channel_handle": ch, "id": f"{ch}-{i}"}, "리노공업")


def test_one_per_channel_first():
    ordered = [_m("a", 1), _m("a", 2), _m("a", 3), _m("b", 1), _m("c", 1), _m("a", 4)]
    got = [m["id"] for m, _ in mr.spread_by_channel(ordered, 4)]
    assert got == ["a-1", "b-1", "c-1", "a-2"]


def test_fills_rest_in_order_and_caps():
    ordered = [_m("a", i) for i in range(10)]
    got = [m["id"] for m, _ in mr.spread_by_channel(ordered, 3)]
    assert got == ["a-0", "a-1", "a-2"]
