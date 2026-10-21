"""common/homepage_logo — 회사 홈페이지에서 로고 후보를 모으는 순수 함수들(2026-10-21)."""
from common import homepage_logo as H

PAGE = """<html><head><title> 코세스 | KOSES </title>
<meta property="og:site_name" content="KOSES">
<link rel="apple-touch-icon" href="/apple.png">
<link rel="icon" sizes="32x32" href="/fav32.png">
<link rel="icon" sizes="192x192" href="/fav192.png">
<meta property="og:image" content="https://cdn.example.com/og.jpg">
</head><body>
<img src="/img/banner.jpg" alt="배너">
<img src="/img/common/logo.png" alt="로고">
<img src="/img/ci/main.gif">
<div style="background:url('/css/top_logo.png')"></div>
</body></html>"""


def test_logo_candidates_order_and_resolve():
    got = H.logo_candidates("https://www.koses.co.kr/main/", PAGE)
    assert got[0] == ("img-logo", "https://www.koses.co.kr/img/common/logo.png")
    assert ("img-logo", "https://www.koses.co.kr/img/ci/main.gif") in got
    kinds = [k for k, _ in got]
    assert kinds.index("apple-touch") < kinds.index("icon-big") < kinds.index("og")
    assert all("banner" not in u and "fav32" not in u for _, u in got)


def test_site_names():
    assert H.site_names(PAGE) == ("코세스 | KOSES", "KOSES")
    assert H.site_names("<html></html>") == ("", "")


def test_is_svg_bytes():
    assert H.is_svg_bytes(b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')
    assert H.is_svg_bytes(b"\x89PNG....", "image/svg+xml")
    assert not H.is_svg_bytes(b"<!doctype html><html><svg></svg></html>")


def test_naver_homepage_reads_cell(monkeypatch):
    html = ('<tr><th scope="row" class="c1 txt">홈페이지</th>\n\t<td class="c2 txt">\n\t\t'
            '<a href="http://www.g2gbio.com" target="comPage">http://www.g2gbio.com</a></td>')
    monkeypatch.setattr(H, "fetch", lambda url, *a, **k: (url, html.encode("utf-8"), "text/html"))
    assert H.naver_homepage("456160") == "http://www.g2gbio.com"
    monkeypatch.setattr(H, "fetch", lambda url, *a, **k: (url, b'<th scope="row" class="c1 txt">\xed\x99\x88\xed\x8e\x98\xec\x9d\xb4\xec\xa7\x80</th><td class="c2 txt"></td>', ""))
    assert H.naver_homepage("000000") is None
