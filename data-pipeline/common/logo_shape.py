"""로고 그림을 22px 동그라미에 맞게 다듬는 셈 — 가로로 긴 글자 로고에서 정사각형 조각(첫 덩어리)을 찾는다.

## 왜

화면의 종목 로고는 22px 동그라미다. 가로로 긴 글자 로고(가로세로 3~8배)는 그 안에서 글자 높이가 4~5px 라 못 읽혀
화면(StockLogo unreadableMark)이 머리글자 배지로 바꿨다 — 화면에 보이는 국장 종목 260개 중 53개(2026-10-18 실측).
로고 앞쪽의 첫 덩어리를 잘라 정사각형으로 쓰면 읽힌다. 심볼이 앞에 있으면 심볼(현대제철 H · HD현대 화살표 · LG ·
롯데 L)이, 글자만 있으면 브랜드 서체 · 색 그대로의 첫 글자(바텍 V · 유니드 U · NHN N)가 잘린다.

## 어떻게

잉크(흰색 · 투명이 아닌 픽셀)의 가로 투영으로 덩어리를 나눈다. 위아래로 줄이 둘 이상이면(삼성 계열처럼 심볼 위 · 글자
아래) 가장 높은 줄만 본다. 높이가 줄의 45% 아래인 덩어리(점 · ® · 작은 장식)는 건너뛰고, 첫 덩어리가 가로로 1.9배 넘게
길면(글자가 붙은 필기체 · 한 덩어리 글자) 못 자른다.

돌려주는 상자는 덩어리를 꼭 맞게 감싼 것(512px 그림 안 비율)이다. 여백과 정사각형 맞추기는 /api/logo 가 한다
(옆 글자가 비치지 않게 덩어리 밖은 투명으로 채운다).

Pillow 와 numpy(pandas 가 이미 깐다)가 필요하다. 없으면 None — 자르지 않고 예전처럼 둔다.
"""

from __future__ import annotations

import io

INK = 40           # 흰색에서 이만큼 넘게 어두운 채널이 있으면 잉크
WIDE = 1.6         # 잉크 상자의 가로세로가 이보다 길면 '긴 로고'
MIN_PIECE_H = 0.45  # 덩어리 높이가 줄 높이의 이 비율보다 낮으면 장식으로 보고 건너뛴다
MAX_PIECE_ASPECT = 1.9
MIN_PIECE_ASPECT = 0.35  # 이보다 가는 덩어리(! · I · l)는 혼자 서면 무슨 로고인지 모른다 — 자르지 않는다
MAX_SKIPPED = 0.15       # 건너뛴 작은 덩어리가 줄 폭의 이 비율을 넘으면 앞 글자를 버린 것이다(금호건설 'al') — 자르지 않는다


def _arrays(body: bytes):
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        return None
    try:
        im = Image.open(io.BytesIO(body)).convert("RGBA")
    except Exception:  # noqa: BLE001 — 깨진 그림은 다듬지 않는다
        return None
    a = np.asarray(im).astype(np.int16)
    rgb, alpha = a[..., :3], a[..., 3]
    ink = (alpha >= 128) & ((255 - rgb).max(axis=2) > INK)
    return np, ink


def _runs(mask_1d, mingap: int) -> list[list[int]]:
    """참인 칸의 덩어리 [시작, 끝). mingap 칸보다 짧은 틈은 같은 덩어리로 붙인다."""
    segs: list[list[int]] = []
    start = end = None
    for i, v in enumerate(mask_1d):
        if v:
            if start is None:
                start = i
            elif i - end >= mingap:
                segs.append([start, end])
                start = i
            end = i + 1
    if start is not None:
        segs.append([start, end])
    return segs


def is_wide(body: bytes) -> bool | None:
    """잉크 상자가 가로로 긴가(WIDE 배 넘게). 못 읽으면 None."""
    got = _arrays(body)
    if got is None:
        return None
    np, ink = got
    ys, xs = np.nonzero(ink)
    if not len(xs):
        return None
    return bool((xs.max() - xs.min() + 1) > WIDE * (ys.max() - ys.min() + 1))


def piece_box(body: bytes) -> list[float] | None:
    """긴 로고의 첫 덩어리를 꼭 맞게 감싼 상자 [x, y, w, h](그림 안 비율). 긴 로고가 아니거나 못 자르면 None."""
    got = _arrays(body)
    if got is None:
        return None
    np, ink = got
    H, W = ink.shape
    ys, xs = np.nonzero(ink)
    if not len(xs):
        return None
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    if (x1 - x0) <= WIDE * (y1 - y0):
        return None
    rows = ink[y0:y1, x0:x1].any(axis=1)
    rsegs = _runs(rows, max(2, int(0.08 * (y1 - y0))))
    if len(rsegs) >= 2:
        top, bot = max(rsegs, key=lambda s: s[1] - s[0])
        sub = ink[y0 + top : y0 + bot, x0:x1]
        sy, sx = np.nonzero(sub)
        y0, y1 = y0 + top + sy.min(), y0 + top + sy.max() + 1
        x0, x1 = x0 + sx.min(), x0 + sx.max() + 1
    h = y1 - y0
    cols = ink[y0:y1, x0:x1].any(axis=0)
    skipped = 0
    for s, e in _runs(cols, max(1, int(0.03 * h))):
        piece = ink[y0:y1, x0 + s : x0 + e]
        py, px = np.nonzero(piece)
        if not len(py):
            continue
        bx0, bx1 = x0 + s + px.min(), x0 + s + px.max() + 1
        by0, by1 = y0 + py.min(), y0 + py.max() + 1
        bw, bh = bx1 - bx0, by1 - by0
        if bh < MIN_PIECE_H * h:
            skipped += bw
            continue
        if skipped > MAX_SKIPPED * (x1 - x0) or not (MIN_PIECE_ASPECT <= bw / bh <= MAX_PIECE_ASPECT):
            return None
        # numpy 수가 아니라 파이썬 float 로 — 판정표(jsonb)에 그대로 쓴다.
        return [round(float(bx0) / W, 4), round(float(by0) / H, 4), round(float(bw) / W, 4), round(float(bh) / H, 4)]
    return None


def square_png(body: bytes, size: int = 256, box: list[float] | None = None) -> bytes | None:
    """그림(또는 그 안의 상자)을 투명 여백을 둔 정사각형 PNG 로. 흰 바탕은 투명으로 바꾸지 않는다(로고 그대로).
    긴 로고면 첫 덩어리를 자른다(box 를 안 주면 piece_box 로 찾는다). 못 읽으면 None."""
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        im = Image.open(io.BytesIO(body)).convert("RGBA")
    except Exception:  # noqa: BLE001
        return None
    if box is None:
        box = piece_box(body)
    if box:
        W, H = im.size
        im = im.crop((int(box[0] * W), int(box[1] * H), int((box[0] + box[2]) * W), int((box[1] + box[3]) * H)))
    else:
        got = _arrays(body)
        if got is not None:
            np, ink = got
            ys, xs = np.nonzero(ink)
            if len(xs):
                im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    side = int(max(im.size) * 1.28)
    canvas = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    canvas.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2))
    out = io.BytesIO()
    canvas.resize((size, size), Image.LANCZOS).save(out, "PNG")
    return out.getvalue()
