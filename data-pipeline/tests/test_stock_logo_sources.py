"""refresh_stock_logo_sources — 국장 종목 로고를 어떤 길로 물을지 판정하는 순수 함수들(2026-10-18)."""
from datetime import datetime, timezone

import refresh_stock_logo_sources as R


def test_domain_of_strips_scheme_www_path():
    assert R.domain_of("http://www.melcon.co.kr") == "melcon.co.kr"
    assert R.domain_of("https://WWW.Embrain.com/kr/index.html") == "embrain.com"
    assert R.domain_of("www2.example.co.kr:8080/main") == "example.co.kr"
    assert R.domain_of("kinemaster.com") == "kinemaster.com"


def test_domain_of_rejects_blank_ip_and_platforms():
    assert R.domain_of("") is None
    assert R.domain_of(None) is None
    assert R.domain_of("http://211.43.1.2") is None
    # 블로그 · SNS 를 홈페이지로 적은 회사 — 그 도메인으로 물으면 플랫폼 로고가 온다.
    assert R.domain_of("http://blog.naver.com/somecorp") is None
    assert R.domain_of("https://www.facebook.com/corp") is None
    assert R.domain_of("http://corp.modoo.at") is None
    # 이름에 플랫폼 글자가 들어 있을 뿐인 회사 도메인은 남긴다.
    assert R.domain_of("http://www.naverland.co.kr") == "naverland.co.kr"


def test_parse_kind_reads_code_and_homepage():
    page = (
        "<table><tr><th>회사명</th><th>시장구분</th><th>종목코드</th><th>업종</th><th>주요제품</th><th>상장일</th>"
        "<th>결산월</th><th>대표자명</th><th>홈페이지</th><th>지역</th></tr>"
        "<tr><td>멜콘</td><td>코스닥</td><td style='mso-number-format:\"@\"'>179880</td><td>업</td><td>품</td>"
        "<td>2025-01-01</td><td>12월</td><td>대표</td><td>http://www.melcon.co.kr</td><td>경기</td></tr>"
        "<tr><td>삼성전자</td><td>유가</td><td>5930</td><td>업</td><td>품</td><td>1975-06-11</td><td>12월</td>"
        "<td>대표</td><td>http://www.samsung.com/sec</td><td>경기</td></tr>"
        "<tr><td>빈집</td><td>코스닥</td><td>0035S0</td><td>업</td><td>품</td><td>2026-01-01</td><td>12월</td>"
        "<td>대표</td><td></td><td>서울</td></tr></table>"
    )
    assert R.parse_kind(page) == {"179880": "melcon.co.kr", "005930": "samsung.com", "0035S0": None}


NOW = datetime(2026, 10, 18, tzinfo=timezone.utc)


def test_pick_targets_orders_new_changed_stale(monkeypatch):
    monkeypatch.setattr(R, "EXCLUDE", {"000004": "손으로 뺌"})
    stocks = [{"code": c, "market": "KOSDAQ"} for c in ("000001", "000002", "000003", "000004", "000005", "000006")]
    existing = {
        "000002": {"domain": "old.co.kr", "checked_at": "2026-10-10T00:00:00+00:00"},  # 도메인 바뀜
        "000003": {"domain": "c.co.kr", "checked_at": "2026-07-01T00:00:00+00:00"},  # 60일 넘음
        "000005": {"domain": "e.co.kr", "checked_at": "2026-10-17T00:00:00+00:00"},  # 최근 — 안 묻는다
        "000006": {"domain": "f.co.kr", "checked_at": "2026-10-17T00:00:00+00:00", "note": "예전에 뺀 것"},
    }
    domains = {"000001": "a.co.kr", "000002": "new.co.kr", "000003": "c.co.kr", "000005": "e.co.kr", "000006": "f.co.kr"}
    got = R.pick_targets(stocks, existing, domains, NOW, 10)
    assert [t["code"] for t in got] == ["000001", "000002", "000006", "000003"]
    assert got[1]["domain"] == "new.co.kr"
    assert [t["code"] for t in R.pick_targets(stocks, existing, domains, NOW, 2)] == ["000001", "000002"]


def test_pick_targets_without_kind_keeps_table_domain():
    stocks = [{"code": "000002", "market": "KOSPI"}]
    existing = {"000002": {"domain": "old.co.kr", "checked_at": "2026-07-01T00:00:00+00:00"}}
    got = R.pick_targets(stocks, existing, None, NOW, 10)
    assert got == [{"code": "000002", "market": "KOSPI", "domain": "old.co.kr"}]


T = {"code": "058470", "market": "KOSDAQ", "domain": "leeno.co.kr"}


def test_decide_prefers_ticker_then_domain():
    assert R.decide(T, (200, "aa", None), None)["source"] == "ticker"
    row = R.decide(T, (404, None, None), (200, "bb", 0.05))
    assert (row["source"], row["digest"], row["domain"]) == ("domain", "bb", "leeno.co.kr")
    assert R.decide(T, (404, None, None), (404, None, None))["source"] == "none"
    assert R.decide({**T, "domain": None}, (404, None, None), None)["source"] == "none"
    # 선명도를 못 잰 도메인 그림(Pillow 없음)은 거르지 않는다.
    assert R.decide(T, (404, None, None), (200, "bb", None))["source"] == "domain"


def test_decide_drops_blurry_domain_picture():
    row = R.decide(T, (404, None, None), (200, "cc", 0.0001))
    assert (row["source"], row["note"], row["digest"]) == ("none", R.BLUR_NOTE, "cc")


def test_sharpness_tells_blurry_from_sharp():
    n = 8
    white, black = (255, 255, 255), (0, 0, 0)
    # 가운데 검은 네모 — 경계가 선명하다.
    sharp = [black if 2 <= x < 6 and 2 <= y < 6 else white for y in range(n) for x in range(n)]
    # 흰색에서 회색으로 천천히 바뀌는 그림 — 키운 파비콘처럼 이웃끼리 차이가 작다.
    blurry = [(255 - 8 * (x + y),) * 3 for y in range(n) for x in range(n)]
    assert R.sharpness(sharp, n) > R.BLUR_MAX
    assert R.sharpness(blurry, n) == 0
    # 노란 해처럼 밝기는 비슷해도 색이 다르면 선명하다.
    yellow = [(255, 220, 0) if 2 <= x < 6 and 2 <= y < 6 else white for y in range(n) for x in range(n)]
    assert R.sharpness(yellow, n) > R.BLUR_MAX


def test_decide_defers_on_errors():
    # 오류 · 한도는 판정하지 않는다 — 예전 행을 그대로 둔다.
    assert R.decide(T, (500, None, None), None) is None
    assert R.decide(T, (-1, None, None), None) is None
    assert R.decide(T, (404, None, None), (502, None, None)) is None


def test_generic_digest_turns_shared_pictures_to_none(monkeypatch):
    monkeypatch.setattr(R, "EXCLUDE", {})
    stocks = [{"code": c, "market": "KOSDAQ"} for c in ("1", "2", "3", "4", "5")]
    rows = {
        "1": {"code": "1", "source": "domain", "digest": "wp"},
        "2": {"code": "2", "source": "domain", "digest": "wp"},
        "3": {"code": "3", "source": "domain", "digest": "wp"},
        "4": {"code": "4", "source": "domain", "digest": "own"},
        "5": {"code": "5", "source": "ticker", "digest": "wp"},  # 티커로 받은 그림은 세지도 거르지도 않는다
    }
    changed = R.apply_filters(rows, stocks)
    assert sorted(r["code"] for r in changed) == ["1", "2", "3"]
    assert rows["1"]["source"] == "none" and rows["1"]["note"] == R.GENERIC_NOTE
    assert rows["4"]["source"] == "domain" and rows["5"]["source"] == "ticker"


def test_generic_counts_already_flagged_rows(monkeypatch):
    # 지난 실행에 기본 아이콘으로 돌린 셋 + 이번에 같은 그림을 받은 넷째 → 넷째도 걸린다.
    monkeypatch.setattr(R, "EXCLUDE", {})
    stocks = [{"code": c, "market": "KOSDAQ"} for c in ("1", "2", "3", "4")]
    rows = {c: {"code": c, "source": "none", "digest": "wp", "note": R.GENERIC_NOTE} for c in ("1", "2", "3")}
    rows["4"] = {"code": "4", "source": "domain", "digest": "wp"}
    changed = R.apply_filters(rows, stocks)
    assert [r["code"] for r in changed] == ["4"]


def test_exclude_forces_none_once(monkeypatch):
    monkeypatch.setattr(R, "EXCLUDE", {"9": "사진"})
    stocks = [{"code": "9", "market": "KOSDAQ"}]
    rows = {"9": {"code": "9", "market": "KOSDAQ", "source": "domain", "digest": "x", "domain": "x.co.kr"}}
    changed = R.apply_filters(rows, stocks)
    assert changed and rows["9"]["source"] == "none" and rows["9"]["note"] == "사진"
    # 이미 같은 이유로 none 이면 다시 적지 않는다.
    assert R.apply_filters(rows, stocks) == []


def test_new_stocks_go_by_market_cap():
    # 처음 채울 때 상한에 걸려도 큰 종목(화면에 자주 나오는 종목)부터 채워진다.
    stocks = [
        {"code": "000001", "market": "KOSDAQ", "market_cap": 10},
        {"code": "000002", "market": "KOSPI", "market_cap": 900},
        {"code": "000003", "market": "KOSDAQ", "market_cap": None},
        {"code": "000004", "market": "KOSDAQ", "market_cap": 50},
    ]
    got = R.pick_targets(stocks, {}, {}, NOW, 3)
    assert [t["code"] for t in got] == ["000002", "000004", "000001"]


def test_domain_override_and_own_logo(monkeypatch):
    monkeypatch.setattr(R, "EXCLUDE", {})
    monkeypatch.setattr(R, "DOMAIN_OVERRIDE", {"000001": "nota.ai"})
    monkeypatch.setattr(R, "OWN_LOGO", {"000002": ("https://x.example/logo.png", None)})
    stocks = [{"code": "000001", "market": "KOSDAQ"}, {"code": "000002", "market": "KOSDAQ"}]
    got = R.pick_targets(stocks, {}, {"000001": None}, NOW, 10)
    # 손 도메인이 거래소 목록보다 먼저 · 우리 그림 종목은 logo.dev 에 묻지 않는다
    assert got == [{"code": "000001", "market": "KOSDAQ", "domain": "nota.ai"}]


def test_exclude_does_not_override_own_logo(monkeypatch):
    monkeypatch.setattr(R, "EXCLUDE", {"9": "흐린 그림"})
    monkeypatch.setattr(R, "OWN_LOGO", {"9": ("https://x.example/logo.png", None)})
    rows = {"9": {"code": "9", "market": "KOSDAQ", "source": "own", "digest": "x"}}
    assert R.apply_filters(rows, [{"code": "9", "market": "KOSDAQ"}]) == []
    assert rows["9"]["source"] == "own"


def test_crop_for_prefers_manual_box(monkeypatch):
    monkeypatch.setattr(R, "CROP_OVERRIDE", {"000270": [0.1, 0.4, 0.3, 0.2], "099220": []})
    called = []
    monkeypatch.setattr(R, "fetch_logo", lambda *a, **k: called.append(a) or (200, b""))
    assert R.crop_for("000270", None, "ticker/000270.KS", "k") == [0.1, 0.4, 0.3, 0.2]
    assert R.crop_for("099220", None, "ticker/099220.KQ", "k") == []
    assert called == []  # 손 설정이면 logo.dev 에 다시 묻지 않는다
    # 그림을 못 읽으면 None(다음 실행에 다시)
    assert R.crop_for("005930", None, "ticker/005930.KS", "k") is None


def test_logo_path_matches_route():
    assert R.logo_path({"code": "005930", "market": "KOSPI", "source": "ticker"}) == "ticker/005930.KS"
    assert R.logo_path({"code": "169330", "market": "KOSDAQ", "source": "domain", "domain": "embrain.com"}) == "embrain.com"
    assert R.logo_path({"code": "1", "market": "KOSDAQ", "source": "none"}) is None


def test_crop_for_drops_blurry_piece(monkeypatch):
    # 긴 로고의 첫 덩어리가 흐리면(작은 원본을 키운 것) 자르지 않는다.
    import io

    import pytest

    PIL = pytest.importorskip("PIL")  # noqa: F841
    from PIL import Image, ImageDraw, ImageFilter

    def wide(blur: bool) -> bytes:
        im = Image.new("RGB", (512, 512), "white")
        d = ImageDraw.Draw(im)
        d.rectangle([40, 220, 100, 280], fill=(0, 90, 200))
        for i in range(4):
            d.rectangle([130 + i * 80, 225, 180 + i * 80, 275], fill=(20, 20, 20))
        if blur:
            im = im.resize((32, 32)).resize((512, 512)).filter(ImageFilter.GaussianBlur(6))
        out = io.BytesIO()
        im.save(out, "PNG")
        return out.getvalue()

    monkeypatch.setattr(R, "CROP_OVERRIDE", {})
    monkeypatch.setattr(R.time, "sleep", lambda *_: None)
    small = Image.new("RGB", (64, 16), "black")
    buf = io.BytesIO()
    small.save(buf, "PNG")
    for blur, want_cut in ((False, True), (True, False)):
        monkeypatch.setattr(R, "fetch_logo", lambda *a, _b=blur, **k: (200, wide(_b)))
        got = R.crop_for("123456", buf.getvalue(), "ticker/123456.KQ", "k")
        assert (got != []) is want_cut, (blur, got)


def test_blurry_ticker_switches_to_sharp_domain():
    # 티커 그림이 흐리면(작은 원본을 키움) 선명한 도메인 그림으로 바꾼다.
    sharp_t = (200, "t", None, b"", 120.0)
    blurry_t = (200, "t", None, b"", 24.0)
    sharp_d = (200, "d", 0.05, b"", 150.0)
    blurry_d = (200, "d", 0.05, b"", 20.0)
    assert R.decide(T, sharp_t, None)["source"] == "ticker"
    row = R.decide(T, blurry_t, sharp_d)
    assert (row["source"], row["digest"], row["note"]) == ("domain", "d", None)
    # 도메인도 흐리거나 없으면 흐린 티커를 그대로 쓰되 손 보충 목록(note)에 올린다
    for dom in (blurry_d, None, (404, None, None, None, None)):
        row = R.decide(T, blurry_t, dom)
        assert (row["source"], row["note"]) == ("ticker", R.BLUR_SOURCE_NOTE)
    # 흐린 원본 note 는 자동 판정이라 손으로 뺀 것처럼 다시 묻지 않는다
    assert R.BLUR_SOURCE_NOTE in R.AUTO_NOTES


def test_steepness_tells_upscaled_from_sharp():
    import io

    import pytest

    pytest.importorskip("PIL")
    from PIL import Image, ImageDraw

    def logo(blur: bool) -> bytes:
        im = Image.new("RGB", (128, 128), "white")
        ImageDraw.Draw(im).rectangle([30, 40, 98, 88], fill=(20, 40, 160))
        if blur:  # 16px 원본을 키운 것
            im = im.resize((16, 16), Image.BILINEAR).resize((128, 128), Image.BILINEAR)
        out = io.BytesIO()
        im.save(out, "PNG")
        return out.getvalue()

    assert R.steepness(logo(False)) >= R.STEEP_MIN
    assert R.steepness(logo(True)) < R.STEEP_MIN


def test_recheck_all_reprobes_recent_rows():
    stocks = [{"code": "000001", "market": "KOSPI"}]
    existing = {"000001": {"domain": "a.co.kr", "checked_at": "2026-10-18T00:00:00+00:00"}}
    assert R.pick_targets(stocks, existing, {"000001": "a.co.kr"}, NOW, 10) == []
    assert [t["code"] for t in R.pick_targets(stocks, existing, {"000001": "a.co.kr"}, NOW, 10, recheck_all=True)] == ["000001"]
