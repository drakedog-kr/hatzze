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
