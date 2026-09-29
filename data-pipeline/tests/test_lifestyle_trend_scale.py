"""생활소비 검색 지수(fetch_naver_lifestyle_trend)의 눈금 — 파인다이닝 값이 '폐업' 검색량에 딸려 움직이지 않는지.

데이터랩 ratio 는 **한 요청 결과 전체**에서 가장 큰 값을 100 으로 둔 상대값이다. 두 그룹을 한 요청에 담던
때는 봉우리가 낮은 쪽이 높은 쪽 눈금으로 눌렸다. 아래 가짜 데이터랩은 그 규칙대로 정규화한다.
"""
import fetch_naver_lifestyle_trend as trend

DINING, CLOSURE = (g["group_name"] for g in trend.GROUP_CONFIGS)


class _Resp:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


def fake_datalab(volumes: dict[str, list[float]], calls: list):
    """실제 검색량(volumes)을 받아, 요청에 담긴 그룹 전체의 최댓값을 100 으로 둔 응답을 돌려준다."""

    def search_trend(body):
        calls.append(body)
        groups = body["keywordGroups"]
        peak = max(v for g in groups for v in volumes[g["groupName"]])
        return _Resp({
            "results": [
                {
                    "title": g["groupName"],
                    "data": [
                        {"period": f"2026-09-{i + 1:02d}", "ratio": v / peak * 100}
                        for i, v in enumerate(volumes[g["groupName"]])
                    ],
                }
                for g in groups
            ]
        })

    return search_trend


def ratios(monkeypatch, dining, closure):
    calls = []
    monkeypatch.setattr(trend, "search_trend", fake_datalab({DINING: dining, CLOSURE: closure}, calls))
    return [[p["ratio"] for p in pts] for pts in trend.fetch_search_trends()], calls


def test_closure_spike_does_not_shrink_fine_dining(monkeypatch):
    dining = [10, 20, 40]  # 파인다이닝 관심은 그대로
    quiet, _ = ratios(monkeypatch, dining, [5, 30, 10])
    spike, _ = ratios(monkeypatch, dining, [5, 400, 10])  # '폐업' 검색만 1년 최고치
    assert quiet[0] == spike[0] == [25.0, 50.0, 100.0]


def test_each_group_is_its_own_0_to_100_index(monkeypatch):
    (dining, closure), calls = ratios(monkeypatch, [10, 20, 40], [5, 400, 10])
    assert max(dining) == 100.0
    assert max(closure) == 100.0
    # 요청 하나엔 그룹 하나만 — 두 주제가 한 눈금을 나눠 쓰지 않게.
    assert [len(c["keywordGroups"]) for c in calls] == [1, 1]
