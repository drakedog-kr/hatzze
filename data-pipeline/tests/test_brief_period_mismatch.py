"""첫째 대목의 '최근 N일'이 [전체] 줄의 기간과 다르면 한 번 다시 쓴다(2026-10-08 마지막 점검)."""
import generate_telegram_narratives as N

DIGEST = "[전체] 최근 2일(10-07~10-08, 오늘 포함) 시장 글 120건 · 낙관도 39% · 비관 우세"


def test_mismatch_found():
    assert N.period_mismatch("최근 3일 시장 전체를 말한 글의 낙관도는 39%입니다.", DIGEST) == (3, 2)


def test_same_period_passes():
    assert N.period_mismatch("최근 2일 시장 글의 낙관도는 39%입니다.", DIGEST) is None


def test_no_period_in_text_passes():
    assert N.period_mismatch("시장 글의 낙관도는 39%로 비관이 앞섰습니다.", DIGEST) is None
