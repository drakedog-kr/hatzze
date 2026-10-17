"""generate_move_reasons.clean_reason — 매수·매도로 읽히는 말은 버린다(2026-10-15 점검: 미장 이유 5 · 국장 이유 3)."""
import generate_move_reasons as M


def test_trade_framing_is_rejected():
    t, why = M.clean_reason("증권사 투자의견 상향 소식", "퍼스트솔라", "태양광 모듈")
    assert t is None and "매수·매도" in why
    t, why = M.clean_reason("기술적 매도 신호 발생 속 차익 실현", "테슬라", "테슬라 차익 실현")
    assert t is None and "매도 신호" in why


def test_plain_reason_passes():
    t, why = M.clean_reason("정유 마진 개선 기대 부각", "S-Oil", "정유 마진 개선 기대")
    assert t == "정유 마진 개선 기대 부각" and why == ""
