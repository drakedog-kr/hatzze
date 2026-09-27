"""까닭 생성기의 은행(RESEARCH_HOUSES) 가르기 — 은행이 말한 글과 은행이 말해지는 글."""
import generate_telegram_narratives as KR
from generate_move_reasons import RESEARCH_HOUSES, quoted_move, quoted_moves


def test_houses_are_the_five_research_banks():
    assert RESEARCH_HOUSES == {"JPM", "GS", "MS", "BAC", "C"}


def test_quote_after_name_is_the_bank_itself():
    t = "실망 매물이 출회되며 하락. 씨티그룹(-1.90%), JP모건(-1.71%), 웰스파고(-1.75%) 등은 물론"
    got = quoted_moves(t, "JP모건", leading=False)
    assert got == [(-1.71, "JP모건(-1.71%")]
    assert quoted_move("골드만삭스 -3.96% ==== Solomon said", "골드만삭스", leading=False) == -3.96


def test_quote_before_name_belongs_to_the_other_stock():
    # 은행 이름 앞의 표기는 은행이 움직인 남의 종목 것이다.
    t = "» SiTime(+9.1%) 모건스탠리가 비중확대로 커버리지 개시. AI 노출 확대를 긍정적으로 평가"
    assert quoted_move(t, "모건스탠리") == 9.1  # 기본 규칙(국장 `(+20.1%) 로보티즈` 꼴)은 그대로
    assert quoted_moves(t, "모건스탠리", leading=False) == []


def test_bank_as_speaker_has_no_quote():
    for t in (
        "골드만삭스는 하이퍼스케일러 AI 투자가 내년 50% 늘 것으로 전망했다",
        "JP모건) 한미반도체; 주가가 고점 대비 38% 하락한 뒤 반등",
        "골드만삭스 컨퍼런스에서 젠슨 황은 사이버 보안을 다음 적용 분야로 지목",
    ):
        needle = "JP모건" if "JP모건" in t else "골드만삭스"
        assert quoted_moves(t, needle, leading=False) == []


def test_non_house_default_reads_leading_quote():
    assert quoted_move("수급 정리 (+20.1%) 로보티즈 외국인 순매수", "로보티즈") == 20.1


def test_spot_moves_the_excerpt_window_to_the_bank_itself():
    head = "장전 브리핑 " + "시황 정리 " * 12
    speaker = "사이버보안: JP모건의 향후 3년간 보안 지출 전망에 센티넬원(+3.85%) 강세. "
    filler = "반도체 반발 매수 " * 20
    subject = "금융: BOA(-5.14%)의 트레이딩 수익 정체 발언에 JP모건(-1.71%), 골드만삭스(-3.96%) 등 금융주 약세"
    t = head + speaker + filler + subject
    assert "보안 지출 전망" in KR.excerpt(t, "JP모건")  # 첫 자리로 세우면 은행의 전망이 보인다
    spot = quoted_moves(t, "JP모건", leading=False)[0][1]
    ex = KR.excerpt(t, spot)
    assert "JP모건(-1.71%)" in ex and "보안 지출 전망" not in ex
