"""회사 홈페이지에서 로고 그림 후보를 모은다 — scripts/fill_visible_logos.py 가 쓴다(2026-10-21).

10-19~20 에 손으로 로고 330곳 남짓을 채운 순서를 그대로 옮겼다.
  1. 홈페이지 주소: 거래소 목록(KIND)의 홈페이지 칸, 없으면 네이버 기업정보(와이즈리포트) 기업개요의 '홈페이지' 칸.
     거래소 목록에 홈페이지가 없거나 옛 주소인 곳이 155곳이었다(하림 · 예스24 · 카페24 등).
  2. 첫 화면을 연다(https · http · www 유무 넷을 차례로). 짧은 이동(meta refresh · location.href · frameset)은 두 번까지 따라간다.
  3. 로고 후보: 'logo' · CI 가 든 img, apple-touch-icon, 96px 넘는 icon, CSS 의 logo 그림, og:image(대개 배너라 마지막).
  4. 그림을 받아 래스터(PNG · JPG · GIF · ICO · WebP)만 남긴다. SVG 는 Pillow 가 못 그려 판정 판에 못 붙인다.
첫 화면의 <title> · og:site_name 도 돌려준다 — 홈페이지 주소가 남의 사이트가 된 곳(덕양에너젠 → 동광마켓)을 가르는 데 쓴다.

인증서가 낡은 국내 사이트가 많아 검증을 끈다(refresh_stock_logo_sources.py _LOOSE_SSL 과 같은 까닭). 공개 그림을 읽기만 한다.
"""

from __future__ import annotations

import io
import re
import ssl
import urllib.parse
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE

PAGE_MAX = 4_000_000
IMAGE_MAX = 3_000_000
TIMEOUT_SEC = 10
MAX_CANDIDATES = 4
NAVER_URL = "https://navercomp.wisereport.co.kr/v2/company/c1020001.aspx?cmp_cd={code}"


def fetch(url: str, limit: int = PAGE_MAX, timeout: float = TIMEOUT_SEC) -> tuple[str, bytes, str]:
    """→ (따라간 뒤의 주소, 본문, Content-Type). 못 받으면 예외."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as r:
        return r.geturl(), r.read(limit), r.headers.get("Content-Type", "")


def decode_html(body: bytes) -> str:
    head = body[:3000].decode("ascii", "ignore").lower()
    first = "euc-kr" if ("euc-kr" in head or "ks_c_5601" in head) else "utf-8"
    for enc in (first, "utf-8", "euc-kr"):
        try:
            return body.decode(enc)
        except UnicodeDecodeError:
            continue
    return body.decode("utf-8", "ignore")


_HOP = re.compile(r"(?:url=|location\.href\s*=\s*[\"']|location\.replace\([\"']|<frame[^>]+src=[\"'])([^\"'>;]+)", re.I)


def open_homepage(domain: str) -> tuple[str, str] | None:
    """홈페이지 첫 화면 → (주소, HTML). 넷 다 안 열리면 None."""
    for root in (f"https://www.{domain}", f"https://{domain}", f"http://www.{domain}", f"http://{domain}"):
        try:
            base, body, _ = fetch(root)
        except Exception:  # noqa: BLE001 — 다음 꼴로 다시 연다
            continue
        html = decode_html(body)
        for _ in range(2):  # 짧은 이동 쪽은 본문이 짧거나 frameset 이다
            if len(html) > 1500 and "<frame" not in html.lower():
                break
            m = _HOP.search(html)
            if not m:
                break
            try:
                base, body, _ = fetch(urllib.parse.urljoin(base, m.group(1).strip()))
            except Exception:  # noqa: BLE001
                break
            html = decode_html(body)
        return base, html
    return None


def site_names(html: str) -> tuple[str, str]:
    """첫 화면의 (<title>, og:site_name 또는 og:title). 공백을 줄이고 80자까지."""
    t = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    og = re.search(r"og:(?:site_name|title)[\"']\s+content=[\"']([^\"']+)", html, re.I)

    def clean(s: str | None) -> str:
        return re.sub(r"\s+", " ", s or "").strip()[:80]

    return clean(t.group(1) if t else ""), clean(og.group(1) if og else "")


def logo_candidates(base: str, html: str, limit: int = 6) -> list[tuple[str, str]]:
    """첫 화면 HTML → [(종류, 그림 주소)]. 앞에 놓인 'logo' img 가 먼저다."""
    out: list[tuple[float, str, str]] = []
    for i, m in enumerate(re.finditer(r"<(img|link|meta)\b[^>]*>", html, re.I)):
        tag = m.group(0)
        low = tag.lower()
        src = re.search(r"(?:\bsrc|\bhref|\bcontent|data-src)=[\"']([^\"']+)[\"']", tag, re.I)
        if not src:
            continue
        u = src.group(1).strip()
        if u.startswith("data:"):
            continue
        kind = m.group(1).lower()
        if kind == "img":
            if "logo" in low or re.search(r"[/_\-.]ci[/_\-.]", u.lower()):
                out.append((10 - min(i, 200) / 100, "img-logo", u))
        elif "apple-touch-icon" in low:
            out.append((7, "apple-touch", u))
        elif "icon" in low:
            size = re.search(r"sizes=[\"'](\d+)", low)
            if size and int(size.group(1)) >= 96:
                out.append((6, "icon-big", u))
        elif "og:image" in low and re.search(r"\.(png|gif|jpe?g|webp)(\?|#|$)", u, re.I):
            out.append((2, "og", u))
    for u in re.findall(r"url\(\s*[\"']?([^\"')\s]*logo[^\"')\s]*\.(?:png|gif|jpe?g|webp|svg))", html, re.I):
        out.append((5, "css-logo", u))
    seen: set[str] = set()
    res: list[tuple[str, str]] = []
    for _score, kind, u in sorted(out, key=lambda x: -x[0]):
        full = urllib.parse.urljoin(base, u)
        if full in seen:
            continue
        seen.add(full)
        res.append((kind, full))
    return res[:limit]


def is_svg_bytes(body: bytes, content_type: str = "") -> bool:
    head = body[:1024].decode("utf-8", "ignore").lower()
    return "svg" in content_type.lower() or ("<svg" in head and "<html" not in head)


def raster(body: bytes) -> bool:
    """Pillow 가 읽는 그림이고 로고로 쓸 만한 크기인가(가로 24 · 세로 16 이상, 가로 2,400 이하)."""
    try:
        from PIL import Image
    except ImportError:
        return False
    try:
        im = Image.open(io.BytesIO(body))
        im.load()
    except Exception:  # noqa: BLE001
        return False
    w, h = im.size
    return w >= 24 and h >= 16 and w <= 2400


def download_candidates(cands: list[tuple[str, str]]) -> tuple[list[dict], int]:
    """후보 그림을 받는다 → ([{kind, url, body}] 래스터만 MAX_CANDIDATES 장까지, SVG 수)."""
    got: list[dict] = []
    svg = 0
    for kind, url in cands:
        if len(got) >= MAX_CANDIDATES:
            break
        try:
            _, body, ctype = fetch(url, IMAGE_MAX)
        except Exception:  # noqa: BLE001 — 깨진 주소는 건너뛴다
            continue
        if is_svg_bytes(body, ctype):
            svg += 1
            continue
        if raster(body):
            got.append({"kind": kind, "url": url, "body": body})
    return got, svg


def naver_homepage(code: str) -> str | None:
    """네이버 기업정보 기업개요의 홈페이지 칸('http://www.g2gbio.com'). 없거나 못 받으면 None."""
    try:
        _, body, _ = fetch(NAVER_URL.format(code=code))
    except Exception:  # noqa: BLE001
        return None
    m = re.search(r'<th scope="row" class="c1 txt">홈페이지</th>\s*<td class="c2 txt">\s*(?:<a href="([^"]*)")?', decode_html(body))
    return m.group(1) if m and m.group(1) else None
