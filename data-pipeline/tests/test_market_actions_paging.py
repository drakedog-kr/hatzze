"""KIND 시장조치 검색(fetch_market_actions.search_market_actions)이 결과를 끝 쪽까지 넘겨 받는지.

'매매거래중단' 검색은 1년 남짓 창에 개별종목 매매정지(SPAC 합병 등)까지 섞여 나온다. 예전엔 첫 쪽 500건만
받아서, 그해 정지가 500건을 넘으면 뒤쪽(오래된 쪽)의 CB 발동이 조용히 빠질 수 있었다(#622 에서 찾음).
KIND 에 실제로 묻지 않고 응답 HTML 을 흉내 낸다 — 마크업은 모듈의 정규식이 읽는 꼴 그대로다.
"""
from datetime import date

import pytest

import fetch_market_actions as ma


def _row(i: int, market: str = "코스닥시장", title: str = "매매거래정지 (스팩 합병)") -> str:
    day = date(2026, 1, 1).toordinal() + i % 300
    return (
        f'<strong class="name"><a href="#" onclick="x">{market}</a></strong>\n'
        f'<span class="subject"><a href="#" title="{title} {i}" onclick="y">{title}</a></span>\n'
        f'<em class="date">{date.fromordinal(day).isoformat()} 09:00:00</em>\n'
    )


class _Resp:
    def __init__(self, text: str):
        self.text = text

    def raise_for_status(self):
        return None


def serve(monkeypatch, pages: dict[int, str], beyond: str = ""):
    """pageIndex → HTML. 목록에 없는 쪽을 물으면 `beyond` 를 준다. 물은 쪽 번호를 모아 돌려준다."""
    asked: list[int] = []

    def fake_post(url, label=None, data=None, **kw):
        page = int(data["pageIndex"])
        asked.append(page)
        return _Resp(pages.get(page, beyond))

    monkeypatch.setattr(ma, "post_with_retry", fake_post)
    return asked


FROM, TO = date(2025, 8, 30), date(2026, 9, 29)


def test_reads_past_the_first_page(monkeypatch):
    full = "".join(_row(i) for i in range(ma.PAGE_SIZE))
    tail = "".join(_row(ma.PAGE_SIZE + i, market="유가증권시장", title="매매거래 일시중단 (1단계 CB 발동)") for i in range(3))
    asked = serve(monkeypatch, {1: full, 2: tail})
    got = ma.search_market_actions(ma.CIRCUIT_BREAKER_SEARCH_KEYWORD, FROM, TO)
    assert asked == [1, 2]
    assert len(got) == ma.PAGE_SIZE + 3
    # 둘째 쪽에만 있던 CB 발동이 빠지지 않는다.
    assert len(ma.classify_circuit_breaker(got)) == 3


def test_one_short_page_is_one_request(monkeypatch):
    asked = serve(monkeypatch, {1: "".join(_row(i) for i in range(7))})
    assert len(ma.search_market_actions(ma.SIDECAR_KEYWORD, FROM, TO)) == 7
    assert asked == [1]


def test_full_page_counts_rows_not_parsed_entries(monkeypatch):
    # 정규식이 못 읽는 행(제목 속성이 없는 꼴)이 섞여도 쪽이 찬 것으로 보고 다음 쪽을 묻는다.
    odd = '<strong class="name"><a href="#">코스닥시장</a></strong>\n<span class="subject">제목 없음</span>\n'
    full = odd + "".join(_row(i) for i in range(ma.PAGE_SIZE - 1))
    asked = serve(monkeypatch, {1: full, 2: _row(9_999)})
    assert len(ma.search_market_actions(ma.CIRCUIT_BREAKER_SEARCH_KEYWORD, FROM, TO)) == ma.PAGE_SIZE
    assert asked == [1, 2]


def test_last_page_repeated_beyond_the_end_is_not_double_counted(monkeypatch):
    # 결과가 쪽 크기의 배수이고, 끝을 넘긴 쪽을 물으면 KIND 가 빈 쪽 대신 마지막 쪽을 다시 줄 때.
    first = "".join(_row(i) for i in range(ma.PAGE_SIZE))
    second = "".join(_row(ma.PAGE_SIZE + i) for i in range(ma.PAGE_SIZE))
    serve(monkeypatch, {1: first, 2: second}, beyond=second)
    got = ma.search_market_actions(ma.CIRCUIT_BREAKER_SEARCH_KEYWORD, FROM, TO)
    assert len(got) == 2 * ma.PAGE_SIZE
    assert len(set(got)) == len(got)


def test_runaway_paging_stops_loudly(monkeypatch):
    # 쪽마다 새 행이 가득 오는데 끝이 안 나면 멈추고 알린다 — 조용히 잘라 쓰지 않는다.
    pages = {p: "".join(_row(p * 1_000 + i) for i in range(ma.PAGE_SIZE)) for p in range(1, ma.MAX_PAGES + 2)}
    serve(monkeypatch, pages)
    with pytest.raises(RuntimeError):
        ma.search_market_actions(ma.CIRCUIT_BREAKER_SEARCH_KEYWORD, FROM, TO)
