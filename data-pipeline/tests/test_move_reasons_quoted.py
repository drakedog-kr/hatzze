"""generate_move_reasons.pick_quoted — 표기 등락: 장 전 글 빼기 · 많이 적힌 부호(2026-10-15 점검)."""
import generate_move_reasons as M


def test_premarket_recap_is_dropped():
    # 07시 전날 정리 글의 -12.9 가 부호를 정했다(SK스퀘어). 장 중 글은 오름이다.
    assert M.pick_quoted([(7, -12.91), (10, 3.2), (14, 4.1)], 9) == 4.1
    # 장 전 글뿐이면 그거라도 쓴다.
    assert M.pick_quoted([(7, -12.91)], 9) == -12.91


def test_majority_sign_wins_over_largest_value():
    # 목록 옆 종목 값(+26.5) 하나가 내림 글 셋을 이기던 꼴.
    assert M.pick_quoted([(10, 26.5), (11, -5.7), (13, -5.2), (15, -6.0)], 9) == -6.0
    # 같은 수면 오름 쪽.
    assert M.pick_quoted([(10, 3.0), (11, -9.0)], 9) == 3.0
    assert M.pick_quoted([], 9) is None


def test_us_has_no_open_hour():
    assert M.pick_quoted([(3, -4.0), (5, -2.0), (22, 1.0)], None) == -4.0


def test_digest_carries_direction():
    d = M.build_digest("S-Oil", "010950", [({"text": "정유 마진 개선 기대"}, "정유")], -5.7)
    assert "[등락 방향]" in d and "내림" in d
    assert "[등락 방향]" not in M.build_digest("S-Oil", "010950", [({"text": "정유 마진 개선 기대"}, "정유")], None)
