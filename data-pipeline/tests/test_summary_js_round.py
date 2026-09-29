"""홈 요약 재료의 도수·과열도가 화면과 같은 반올림(JS Math.round)인지 — 26.5℃ 는 26 이 아니라 27 이다.

calculate_score 가 점수·진행률을 소수 둘째 자리로 저장해 x.50 이 나온다. 파이썬 `:.0f` 는 동점을
짝수로 보내(26.5 → 26) 히어로의 Math.round(27℃)와 1도 어긋났고, 모델은 받은 대로 "오늘 26℃"라
적을 수 있었다. 채널 글(send_telegram_broadcast)은 이미 같은 까닭으로 js_round 를 써 왔다(이제 common/js_round.py).
"""
from datetime import date

from common.js_round import js_fixed1, js_round
from generate_daily_summary import build_digest, hot_fallback, trend_lines


def test_js_round_breaks_ties_upward():
    assert [js_round(x) for x in (26.5, 24.5, 2.5, 27.5, 26.49)] == [27, 25, 3, 28, 26]
    assert js_fixed1(9.35) == "9.3"  # 9.35 라는 double 은 9.3499… 다 — JS toFixed(1) 과 같다
    assert js_fixed1(9.25) == "9.3"


def test_trend_lines_use_the_hero_rounding():
    lines = trend_lines([("2026-09-28", 24.5), ("2026-09-29", 26.5)], today=date(2026, 9, 29))
    assert "- 9월 28일(월): 25℃  ← 어제" in lines
    assert "- 9월 29일(화): 27℃  ← 오늘" in lines


def test_missing_today_note_uses_the_hero_rounding():
    lines = trend_lines([("2026-09-28", 26.5)], today=date(2026, 9, 29))
    assert lines[-1].endswith("마지막 줄의 27℃는 어제 값입니다.")


ROW = {"name": "신용융자 잔고", "category": "시장", "capped": 62.5, "hot": False, "slug": "x", "rest": False}


def test_digest_headline_and_rows_use_the_hero_rounding():
    digest = build_digest(26.5, "상온", 0, [ROW], [])
    assert digest.splitlines()[0].startswith("[전체] 햇쩨 지수 27℃")
    assert "과열도 63%" in digest


def test_fallback_sentence_uses_the_card_rounding():
    assert "**신용융자 잔고**(63%)" in hot_fallback([ROW], {"시장": 0, "감성": 0})
