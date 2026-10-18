"""common/logo_shape — 가로로 긴 글자 로고에서 정사각형 조각(첫 덩어리)을 찾는다(2026-10-18)."""
import io

import pytest

PIL = pytest.importorskip("PIL")
np = pytest.importorskip("numpy")
from PIL import Image, ImageDraw  # noqa: E402

from common import logo_shape as S  # noqa: E402


def png(draw) -> bytes:
    im = Image.new("RGBA", (512, 512), (255, 255, 255, 0))
    draw(ImageDraw.Draw(im))
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


def test_square_logo_is_not_wide_and_not_cut():
    body = png(lambda d: d.ellipse([156, 156, 356, 356], fill=(200, 0, 0, 255)))
    assert S.is_wide(body) is False
    assert S.piece_box(body) is None


def test_symbol_then_text_cuts_the_symbol():
    # 왼쪽 정사각형 심볼 + 틈 + 글자 넷(가로로 긴 줄)
    def draw(d):
        d.rectangle([40, 220, 100, 280], fill=(0, 150, 60, 255))
        for i in range(4):
            d.rectangle([130 + i * 80, 225, 180 + i * 80, 275], fill=(20, 20, 20, 255))
    box = S.piece_box(png(draw))
    assert box is not None and all(type(v) is float for v in box)  # 판정표(jsonb)에 그대로 쓴다
    x, y, w, h = box
    assert abs(x * 512 - 40) <= 1 and abs(w * 512 - 61) <= 1 and abs(h * 512 - 61) <= 1


def test_thin_first_glyph_or_joined_word_is_not_cut():
    # 가는 첫 글자(! · I) 뒤 글자들 — 혼자 서면 무슨 로고인지 모른다
    def thin(d):
        d.rectangle([40, 220, 50, 280], fill=(0, 0, 0, 255))
        for i in range(4):
            d.rectangle([80 + i * 70, 220, 130 + i * 70, 280], fill=(0, 0, 0, 255))
    assert S.piece_box(png(thin)) is None
    # 글자가 붙어 한 덩어리(필기체)
    assert S.piece_box(png(lambda d: d.rectangle([40, 230, 470, 280], fill=(0, 0, 0, 255)))) is None


def test_square_png_pads_to_square_with_transparent_margin():
    body = png(lambda d: d.rectangle([40, 220, 470, 280], fill=(0, 0, 200, 255)))
    out = Image.open(io.BytesIO(S.square_png(body, 128)))
    assert out.size == (128, 128)
    assert out.getpixel((0, 0))[3] == 0  # 모서리는 투명
