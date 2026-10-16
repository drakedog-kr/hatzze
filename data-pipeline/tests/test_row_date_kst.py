"""수집기 행 날짜가 KST 인지 — 러너가 UTC 라 date.today() 를 쓰면 09:00 KST 전에 도는 아침 실행이 전날 행을 덮어썼다.

2026-09-14 ~ 10-16 아침 실행 33회 중 16회가 그랬다(여섯 수집기 행 쓰기 190건 중 76건, 2026-10-16 전수 검사 4).

지키는 것:
- 스냅샷형(베스트셀러 · 증권 앱 · 재테크 유튜브)과 '계산한 날' 행(버핏지수 · 신고가 괴리)은 today_kst() 날짜에 쓴다.
- 깃헙 봇 수는 어제(KST) 00:00~23:59:59 를 세어 어제 행에 쓴다 — 아침·저녁 어느 실행이든 같은 구간이다.
"""
from datetime import date

import pytest

import fetch_bestseller_ratio as bs
import fetch_brokerage_app_rank as br
import fetch_github_trading_repos as gh
import fetch_youtube_finance_search as yt

TODAY = date(2026, 10, 17)


class FakeClient:
    """ensure_indicator 와 upsert 만 흉내 낸다. upsert 한 행을 모은다."""

    def __init__(self):
        self.upserts = []

    def table(self, _name):
        return self

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def update(self, *_):
        return self

    def upsert(self, row, **_):
        self.upserts.append(row)
        return self

    def execute(self):
        class R:
            data = [{"id": "ind-1"}]

        return R()


@pytest.mark.parametrize(
    "mod,stub",
    [
        (bs, {"fetch_bestseller_list": lambda: [{"categoryName": "국내도서>경제경영"}] * 9 + [{"categoryName": "소설"}] * 91}),
        (br, {"fetch_brokerage_froth": lambda: (400.0, [{"name": "증권 앱", "rank": 3}])}),
        (yt, {"search_finance_video_ids": lambda: ["a"], "fetch_view_counts": lambda ids: [1_000_000]}),
    ],
)
def test_snapshot_row_is_kst_today(monkeypatch, mod, stub):
    client = FakeClient()
    monkeypatch.setattr(mod, "get_client", lambda: client)
    monkeypatch.setattr(mod, "today_kst", lambda: TODAY)
    for name, fn in stub.items():
        monkeypatch.setattr(mod, name, fn)
    mod.main()
    assert [r["date"] for r in client.upserts] == ["2026-10-17"]


def test_github_counts_yesterday_kst_whole_day(monkeypatch):
    client, queries = FakeClient(), []

    class Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"total_count": 83}

    def fake_get(url, **kw):
        queries.append(kw["params"]["q"])
        return Resp()

    monkeypatch.setattr(gh, "get_client", lambda: client)
    monkeypatch.setattr(gh, "today_kst", lambda: TODAY)
    monkeypatch.setattr(gh, "get_with_retry", fake_get)
    gh.main()
    assert queries[0].endswith(" created:2026-10-16T00:00:00+09:00..2026-10-16T23:59:59+09:00")
    assert client.upserts == [{"indicator_id": "ind-1", "date": "2026-10-16", "raw_value": 83.0}]
