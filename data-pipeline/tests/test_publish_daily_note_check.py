"""publish_daily_note.check — 제목 말투 검사. 2026-09-03 제목만 해라체('…다 팔았다')로 나갔다."""
import publish_daily_note as P


def title_errors(title: str) -> list[str]:
    errors, _ = P.check(title, "")
    return [e for e in errors if e.startswith("제목: 합쇼체")]


def test_haera_title_blocked():
    assert title_errors("브로드컴은 2028년 물량을 이미 다 팔았다")


def test_hapsyo_title_passes():
    assert not title_errors("브로드컴은 2028년 물량을 이미 다 팔았습니다")
    assert not title_errors("HLB 그룹주가 FDA 허가 뒤 모두 상한가였습니다.")
    assert not title_errors("반도체는 어디까지 갈까요? 아니면 멈출까요? 지금 무엇을 봐야 합니까?")
