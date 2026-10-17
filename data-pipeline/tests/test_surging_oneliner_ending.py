"""generate_surging_oneliners — 한 줄이 '~습니다'로 끝나면 다시 쓰고, 고를 땐 명사로 끝나는 후보를 먼저 본다(2026-10-04 점검)."""
import generate_surging_oneliners as G


def test_ends_as_sentence():
    assert G.ends_as_sentence("광통신 부품 수주 기대감이 높아졌습니다")
    assert G.ends_as_sentence("우라늄 가격 반등에 주목받았습니다.")
    assert not G.ends_as_sentence("광통신 부품 수주 기대")
    assert not G.ends_as_sentence("미국 원전 정책 수혜 소식")


def test_pick_prefers_noun_ending():
    cands = ["원전 정책 수혜 기대감이 크게 높아졌습니다", "미국 원전 정책 수혜 기대가 커진 흐름"]
    assert G.pick(cands, "원전 정책 수혜 기대", "카메코") == "미국 원전 정책 수혜 기대가 커진 흐름"


def test_pick_drops_leaked_instruction():
    leak = "AST스페이스모바일 관련 화제는 위성 사업과 경쟁 우주기업 비교에 쏠려 있어 이를 담담하게 적습니다."
    assert G.pick([leak], "위성 사업 경쟁", "AST스페이스모바일") is None
    assert G.pick([leak, "위성 통신 사업과 경쟁사 비교"], "위성 통신 사업 경쟁사 비교", "AST스페이스모바일") == "위성 통신 사업과 경쟁사 비교"


# ── 2026-10-15 점검: 매수·매도 그물 · 겹말 · 머리 꼬리표 ─────────────────────────────


def test_pick_drops_trade_framing():
    # 증권사 투자의견 · 매매 신호는 화면에서 그 종목을 사라는 말이 된다. 남는 게 없으면 None(흐름 요약으로 물러남).
    assert G.pick(["증권사 투자의견 상향 소식과 가격 경쟁력 화제"], "가격 경쟁력", "퍼스트솔라") is None
    assert G.pick(["증권사 투자의견 상향 소식", "태양광 모듈 가격 경쟁력 부각 소식"], "태양광 모듈 가격 경쟁력", "퍼스트솔라") == "태양광 모듈 가격 경쟁력 부각 소식"


def test_tidy_ending_drops_double_noun():
    assert G.tidy_ending("저궤도 위성용 배터리 제조 기술 확보 관련 소식") == "저궤도 위성용 배터리 제조 기술 확보 소식"
    # 줄이면 22자 아래(20자)라 그대로 둔다.
    assert G.tidy_ending("벌크·탱커 부문 실적 개선 기대 관련 소식") == "벌크·탱커 부문 실적 개선 기대 관련 소식"
    assert G.tidy_ending("미국 알래스카 LNG 투자 언급에 철강주 화제 소식") == "미국 알래스카 LNG 투자 언급에 철강주 화제"
    assert G.tidy_ending("아마존과 앤트로픽 클라우드 대형 계약 체결 보도 소식") == "아마존과 앤트로픽 클라우드 대형 계약 체결 보도"
    # 줄이면 22자 아래가 되는 것은 그대로 둔다.
    assert G.tidy_ending("배터리 관련 소식") == "배터리 관련 소식"
    assert G.tidy_ending(None) is None
    assert G.tidy_ending("광통신 부품 수주 기대") == "광통신 부품 수주 기대"


def test_answer_line_strips_labels_and_unpaired_quotes():
    assert G.answer_line("후보: 금융주 어닝 시즌 개막 속 실적 기대 소식") == "금융주 어닝 시즌 개막 속 실적 기대 소식"
    assert G.answer_line("- 관련 자산운용 부문 성장 기대 소식") == "관련 자산운용 부문 성장 기대 소식"
    # 양끝이 짝인 따옴표만 벗긴다 — 안쪽 따옴표는 지킨다.
    assert G.answer_line("\"광통신 부품 수주 기대\"") == "광통신 부품 수주 기대"
    assert G.answer_line("'탱크데이' 이벤트 효과 기대 소식") == "'탱크데이' 이벤트 효과 기대 소식"
