"""scripts/fill_visible_logos — 화면에 뜬 국장 종목 중 로고가 없는 곳을 홈페이지 그림으로 채우는 순수 함수들(2026-10-21)."""
import io
import json
from datetime import datetime, timezone

import pytest

PIL = pytest.importorskip("PIL")
np = pytest.importorskip("numpy")
from PIL import Image, ImageDraw  # noqa: E402

import fill_visible_logos as F  # noqa: E402

NOW = datetime(2026, 10, 21, tzinfo=timezone.utc)


def png(size, draw) -> bytes:
    im = Image.new("RGBA", size, (255, 255, 255, 0))
    draw(ImageDraw.Draw(im))
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


RED_SQUARE = png((120, 120), lambda d: d.rectangle([20, 20, 100, 100], fill=(210, 20, 30, 255)))
WHITE_TEXT = png((200, 80), lambda d: d.rectangle([20, 20, 180, 60], fill=(255, 255, 255, 255)))
LONG_BAR = png((480, 60), lambda d: d.rectangle([10, 20, 470, 40], fill=(20, 40, 160, 255)))


def test_screen_codes_reads_kr_logo_urls_only():
    html = ('<img src="/api/logo/005930.KS?s=48&amp;v=10"><img src="/api/logo/086790.KS?s=48&amp;v=10">'
            '<img src="/api/logo/0001A0.KQ?s=48&amp;v=10"><img src="/api/logo/NVDA?s=48&amp;v=10">')
    assert F.screen_codes(html) == {"005930", "086790", "0001A0"}


def test_theme_paths_keeps_kr_theme_pages():
    html = '<a href="/theme/battery">2차전지</a><a href="/theme/us">미장</a><a href="/theme/us/semis">반도체</a><a href="/theme/ai-software">AI</a>'
    assert F.theme_paths(html) == ["/theme/ai-software", "/theme/battery"]


def test_pick_targets_none_only_and_skips_manual_and_recent_misses(monkeypatch):
    monkeypatch.setattr(F, "OWN_LOGO", {"000005": ("https://x.example/l.png", None)})
    monkeypatch.setattr(F, "EXCLUDE", {"000006": "다른 회사 로고"})
    monkeypatch.setattr(F, "MAX_TARGETS", 3)
    rows = {
        "000001": {"source": "none", "note": None},
        "000002": {"source": "ticker"},
        "000003": {"source": "none", "note": F.AUTO_MISS_PREFIX + "로고 후보 없음 (2026-10-19)"},  # 이틀 전 — 넘긴다
        "000004": {"source": "none", "note": F.AUTO_MISS_PREFIX + "홈페이지가 안 열림 (2026-10-01)"},  # 3주 전 — 다시 본다
        "000005": {"source": "none"},  # 손 설정 OWN_LOGO
        "000006": {"source": "none"},  # 손으로 뺌
        "000007": {"source": "none", "note": "흐린 그림(작은 파비콘을 키운 것)"},
        "000008": {"source": "none"},
    }
    codes = set(rows) | {"000009"}  # 판정표에 없는 종목은 넘긴다
    assert F.pick_targets(codes, rows, NOW) == ["000001", "000004", "000007"]  # 상한 3
    assert F.pick_targets(codes, rows, NOW, only={"000003"}) == ["000003"]  # 손으로 고르면 최근 실패도 다시


def test_miss_date():
    assert F.miss_date(F.AUTO_MISS_PREFIX + "다른 회사 사이트로 보임 · 제목 (동광마켓) (2026-10-21)") == datetime(2026, 10, 21, tzinfo=timezone.utc)
    assert F.miss_date("흐린 그림") is None


def test_screen_shape_rejects_white_and_long_logos():
    got = F.screen_shape(RED_SQUARE)
    assert got is not None and abs(got[1] - 1) < 0.05
    assert F.screen_shape(WHITE_TEXT) is None   # 흰 로고 — 화면이 배지로 바꾼다
    assert F.screen_shape(LONG_BAR) is None     # 가로 23배 — 칸 폭에 얹으면 세로가 몇 픽셀


def test_choose_prefers_readable_square_candidate():
    cands = [{"url": "w", "body": WHITE_TEXT}, {"url": "r", "body": RED_SQUARE}, {"url": "b", "body": LONG_BAR}]
    cand, out = F.choose(cands, [0, 1, 2])
    assert cand["url"] == "r" and out.startswith(b"\x89PNG")
    assert F.choose(cands, [0, 2]) is None


class FakeClient:
    """구독 클라이언트 흉내 — 판정 한 번에 정해 둔 답을 돌려준다."""

    def __init__(self, answer, fallback=False, enabled=True):
        self.answer, self.fallback, self.enabled = answer, fallback, enabled
        self.calls_fallback = 0
        self.seen = []
        self.messages = self

    def create(self, **kw):
        self.seen.append(kw)
        if self.fallback:
            self.calls_fallback += 1

        class R:
            content = [type("B", (), {"text": json.dumps(self.answer, ensure_ascii=False)})()]

        return R()


G = {"domain": "koses.co.kr", "title": "코세스", "og": "", "cands": [{"url": "a", "body": RED_SQUARE}, {"url": "b", "body": RED_SQUARE}]}


def test_judge_sends_sheet_image_and_filters_picks():
    c = FakeClient({"site_is_company": True, "picks": [1, 5, -1], "why": "KOSES 로고"})
    got = F.judge(c, "코세스", "089890", G)
    assert got == {"site_is_company": True, "picks": [1], "why": "KOSES 로고"}
    content = c.seen[0]["messages"][0]["content"]
    assert content[0]["type"] == "image" and content[0]["source"]["media_type"] == "image/png"
    assert "코세스" in content[1]["text"] and "#0~#1" in content[1]["text"]
    assert c.seen[0]["model"] == F.JUDGE_MODEL


def test_judge_discards_api_fallback_and_disabled_subscription():
    assert F.judge(FakeClient({"site_is_company": True, "picks": [0], "why": ""}, fallback=True), "코세스", "089890", G) is None
    off = FakeClient({"site_is_company": True, "picks": [0], "why": ""}, enabled=False)
    assert F.judge(off, "코세스", "089890", G) is None and off.seen == []


def test_gather_reasons(monkeypatch):
    monkeypatch.setattr(F, "naver_homepage", lambda code: None)
    assert F.gather("000001", None) == {"miss": "홈페이지 주소 없음"}
    monkeypatch.setattr(F, "open_homepage", lambda dom: None)
    assert F.gather("000001", "a.co.kr") == {"domain": "a.co.kr", "miss": "홈페이지가 안 열림"}
    monkeypatch.setattr(F, "open_homepage", lambda dom: ("https://a.co.kr/", "<title>에이</title>"))
    monkeypatch.setattr(F, "download_candidates", lambda cands: ([], 2))
    assert F.gather("000001", "a.co.kr")["miss"] == "SVG 로고뿐"
    monkeypatch.setattr(F, "download_candidates", lambda cands: ([{"url": "x", "body": RED_SQUARE}], 0))
    got = F.gather("000001", "a.co.kr")
    assert "miss" not in got and got["title"] == "에이" and len(got["cands"]) == 1


def test_sheet_png_is_one_row_of_cells():
    out = F.sheet_png(G["cands"])
    im = Image.open(io.BytesIO(out))
    assert im.size == (720, 234)
