"""국장 종목 로고를 logo.dev 에 어떤 길로 물을지 판정해 `stock_logo_source` 에 적는다(마이그레이션 103).

## 왜

화면의 종목 로고(/api/logo)는 logo.dev 에 티커로 묻는다. 코스피는 82% 가 나오는데 코스닥은 21% 뿐이었다
(2026-10-18 무작위 표본 코스피 100 · 코스닥 300). 같은 logo.dev 에 회사 홈페이지 **도메인**으로 물으면 티커로
없던 코스닥 237종목 중 159종목(67%)이 나온다. 도메인은 거래소 상장회사 목록(KIND)의 '홈페이지' 칸에서 온다.

그래서 종목마다 ① 티커 ② 도메인 순으로 미리 물어 보고, 되는 길을 적는다. /api/logo 는 이 표를 보고 logo.dev 에
**한 번만** 묻는다(판정이 none 이면 묻지 않고 배지). 방문할 때 하는 일은 그대로다 — 그림은 저장하지 않는다
(logo.dev 무료 약관에서 영구 보관은 유료 조건이다).

## 무엇을 묻나 — 실행마다 MAX_PROBES 종목까지

  1) 표에 없는 종목(새 상장 · 처음 실행)
  2) KIND 홈페이지 도메인이 표와 달라진 종목
  3) RECHECK_DAYS 넘게 안 물어본 종목(오래된 것부터) — logo.dev 가 나중에 로고를 얻기도 한다
처음엔 국장 2,800종목 남짓이라 두 실행쯤 걸리고, 그 뒤로는 실행마다 수십 종목이다.

## 거르는 것

- 여러 회사에 **같은 그림**(sha256)이 나오면 기본 아이콘이다 — 워드프레스 로고(아모그린텍) · 홈페이지 빌더 기본 그림.
  GENERIC_MIN 곳 이상이 같은 그림이면 그 회사들을 모두 none 으로 돌린다.
- 홈페이지가 블로그 · SNS 면 도메인으로 묻지 않는다(그 플랫폼 로고가 온다 — BLOCKED_HOSTS).
- 눈으로 본 엉뚱한 그림(사진 · 옛 이름 · 다른 회사)은 config/stock_logo_exclude.py 에 적는다.

## ⚠️ 한도

logo.dev 무료는 **IP 당 분당 100건**이다(429 + Retry-After 60 · 2026-10-18 실측). PACE_SEC 간격으로 분당 75건 아래로
묻고, 429 를 받으면 한 번 기다렸다 다시 묻는다. 그래도 429 면 여기서 멈추고 물어본 데까지만 적는다.
월 한도(50만)에 비하면 처음 채우기(4,000건 남짓)도 1% 아래다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/refresh_stock_logo_sources.py --dry-run      # 묻기만 하고 적지 않는다
    python scripts/refresh_stock_logo_sources.py [--max 200]
"""

from __future__ import annotations

import base64
import hashlib
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.kind import get_page, rows_of  # noqa: E402
from common.logo_shape import is_svg, is_wide, piece_box, square_png  # noqa: E402
from common.supabase_client import execute_with_retry, get_client, load_all  # noqa: E402
from config.stock_logo_exclude import EXCLUDE  # noqa: E402
from config.stock_logo_shape import CROP_OVERRIDE, DOMAIN_OVERRIDE, OWN_LOGO, PREFER_DOMAIN  # noqa: E402

TABLE = "stock_logo_source"
# 상장회사 목록 전체(코스피 · 코스닥 · 코넥스). EUC-KR HTML 표 — 회사명 · 시장구분 · 종목코드 · 업종 · 주요제품 · 상장일 ·
# 결산월 · 대표자명 · 홈페이지 · 지역.
KIND_URL = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13"
# 이보다 적으면 페이지가 바뀐 것으로 보고 홈페이지를 쓰지 않는다(2026-10-18 코스닥만 1,819).
MIN_KIND_ROWS = 2000
LOGO_URL = "https://img.logo.dev/"
SIZE = 64
# 긴 로고에서 자를 상자는 이 크기 그림에서 잰다 — /api/logo 도 같은 크기를 받아 자른다(상자는 비율이라 크기가 같아야 할 까닭은
# 없지만, 64px 에서는 긴 로고의 글자가 몇 픽셀뿐이라 덩어리가 안 갈린다).
SHAPE_SIZE = 512
# 우리가 두는 그림(source = own)의 크기. 화면이 가장 크게 쓰는 눈금(128)의 두 배.
OWN_SIZE = 256
SVG_MAX = 300_000  # 홈페이지 SVG 로고는 대개 수 KB ~ 수십 KB. 이보다 크면 그림을 품은 문서라 받지 않는다
# 잘라 낸 조각이 이보다 흐리면(선명도 · BLUR_EDGE 기준) 자르지 않는다 — 원본이 작아 키운 첫 글자가 뭉갰다. 2026-10-18 자동 조각
# 578장을 눈으로 본 것에서 나쁜 69장 중 33장을 잡고 멀쩡한 것은 6장만 걸렀다(0.03 이면 43장 · 18장).
CROP_BLUR_MAX = 0.02
PACE_SEC = 0.8
MAX_PROBES = 1500
RECHECK_DAYS = 60
GENERIC_MIN = 3
MARKETS = {"KOSPI": "KS", "KOSDAQ": "KQ"}
# 홈페이지 칸에 블로그 · SNS 가 적힌 회사가 있다. 그 도메인으로 물으면 플랫폼 로고가 온다.
BLOCKED_HOSTS = (
    "naver.com", "daum.net", "kakao.com", "tistory.com", "google.com", "youtube.com", "facebook.com",
    "instagram.com", "linkedin.com", "twitter.com", "x.com", "modoo.at", "wixsite.com", "imweb.me",
)
DOMAIN_RE = re.compile(r"^[a-z0-9-]+(?:\.[a-z0-9-]+)+$")
GENERIC_NOTE = "기본 아이콘(여러 회사에 같은 그림)"
# 도메인으로 받은 그림 가운데 작은 파비콘(16 · 32px)을 키운 것은 흐려서 쓸 수 없다. 이웃 픽셀의 색 차이가 BLUR_EDGE 를 넘는
# 자리의 비율(sharpness)이 BLUR_MAX 아래면 흐린 것으로 본다. 2026-10-18 시가총액 상위 600 의 도메인 67장에서 흐린 넷은
# 0.0000~0.0001, 제대로 된 로고는 0.017 부터였다(노란 해처럼 밝기 차이가 작은 그림도 색 차이로는 선명하다).
BLUR_EDGE = 60
BLUR_MAX = 0.005
BLUR_NOTE = "흐린 그림(작은 파비콘을 키운 것)"
# 묻는 그림 크기 — /api/logo 가 받는 크기(lib/stock-logo.ts LOGO_FETCH_SIZE)와 같아야 화면에 나갈 그림을 판정한다. 흐림(STEEP_MIN)도
# 이 크기에서 잰다 — 64px 에서는 작은 원본을 키운 흐림이 덜 드러났다.
PROBE_SIZE = 128
# 원본이 작아 logo.dev 가 키운 그림은 경계가 완만하다. 128px 그림에서 이웃 픽셀 밝기 차이 상위 1% 의 평균(steepness)이 이보다
# 작으면 흐린 원본으로 본다. 2026-10-19 실측: 삼성전기 · 이수페타시스 23~24, 선명한 로고 97~218(대덕전자 73). 티커로 받는 1,138곳 중 80곳.
# 흐린 원본은 그대로 두고 note 로 손 보충 목록에 올린다(실행 로그에도 찍는다). 도메인 그림으로 저절로 바꾸지 않는다 — 80곳 중 도메인이
# 선명한 5곳을 보니 하나는 다른 회사(삼성전기 → 삼성중공업 로고), 셋은 긴 글자라 화면이 배지로 돌릴 그림이었다. 바꿀 곳은 사람이 보고
# config/stock_logo_shape.py PREFER_DOMAIN(도메인 그림) · OWN_LOGO(홈페이지 그림)에 적는다.
STEEP_MIN = 45
BLUR_SOURCE_NOTE = "흐린 원본(작은 그림을 키운 것)"
AUTO_NOTES = (GENERIC_NOTE, BLUR_NOTE, BLUR_SOURCE_NOTE)
# 화면에 뜬 종목을 홈페이지 그림으로 자동으로 채운 행(scripts/fill_visible_logos.py · 2026-10-21). 손 설정(OWN_LOGO)과 가르는
# 표시다 — 이 잡은 이 행을 다시 묻지 않는다. 틀렸으면 config/stock_logo_exclude.py 에 적는다(다음 실행에 배지로 돌아간다).
AUTO_OWN_NOTE = "자동 고름(홈페이지 그림)"
# 자동으로 못 채운 종목의 note 머리 — 뒤에 이유와 날짜가 붙는다. 사람이 뺀 것이 아니라 다시 묻지 않는다.
AUTO_MISS_PREFIX = "자동 못 고름: "


def is_auto_note(note: str | None) -> bool:
    """스크립트가 스스로 단 note 인가(사람이 뺀 EXCLUDE 이유가 아니다)."""
    return note in AUTO_NOTES or note == AUTO_OWN_NOTE or (note or "").startswith(AUTO_MISS_PREFIX)


def domain_of(homepage: str | None) -> str | None:
    """KIND 홈페이지 칸 → logo.dev 에 물을 도메인('http://www.melcon.co.kr' → 'melcon.co.kr'). 쓸 수 없으면 None."""
    h = (homepage or "").strip().lower()
    if not h:
        return None
    h = re.sub(r"^[a-z]+://", "", h).split("/", 1)[0].split("?", 1)[0].split(":", 1)[0].strip(".")
    h = re.sub(r"^www\d?\.", "", h)
    if not DOMAIN_RE.match(h) or re.fullmatch(r"[\d.]+", h):
        return None
    if any(h == b or h.endswith("." + b) for b in BLOCKED_HOSTS):
        return None
    return h


def parse_kind(page: str) -> dict[str, str | None]:
    """상장회사 목록 → {종목코드: 도메인}. 코드는 6자리로 맞춘다(엑셀용 표라 앞의 0 이 빠져 오기도 한다)."""
    out: dict[str, str | None] = {}
    for cells, _tr in rows_of(page, 10):
        code = cells[2].strip().upper()
        if not code:
            continue
        out[code.zfill(6)] = domain_of(cells[8])
    return out


def pick_targets(
    stocks: list[dict], existing: dict[str, dict], domains: dict[str, str | None] | None, now: datetime, limit: int,
    recheck_all: bool = False, only: set[str] | None = None,
) -> list[dict]:
    """이번에 물어볼 종목(새 종목 → 도메인 바뀐 종목 → 오래된 종목 순). 손으로 뺀 종목은 묻지 않는다(apply_filters 가 맡는다).

    새 종목은 시가총액이 큰 순이다 — 처음 채울 때 실행 상한에 걸려도 화면에 자주 나오는 종목부터 채워진다.

    `domains` 가 None 이면(KIND 를 못 받음) 표의 도메인을 그대로 쓰고, 도메인 바뀜은 따지지 않는다.
    `recheck_all` 이면 모든 행을 오래된 것처럼 다시 묻는다(판정 규칙을 바꾼 뒤 한 번 — --recheck).
    `only` 면 그 종목만 묻는다(손 설정을 고친 뒤 몇 종목만 — --codes 039440,357120).
    """
    fresh, changed, stale = [], [], []
    cutoff = now - timedelta(days=RECHECK_DAYS)
    for s in stocks:
        code = s["code"]
        if code in EXCLUDE or code in OWN_LOGO or (only is not None and code not in only):
            continue
        row = existing.get(code)
        if row and row.get("note") == AUTO_OWN_NOTE and only is None and code not in DOMAIN_OVERRIDE and code not in PREFER_DOMAIN:
            continue  # 자동으로 채운 홈페이지 그림 — 손 설정이 생기기 전엔 다시 묻지 않는다(다시 물으면 none 으로 지운다)
        dom = DOMAIN_OVERRIDE.get(code) or (domains.get(code) if domains is not None else (row or {}).get("domain"))
        t = {"code": code, "market": s["market"], "domain": dom}
        if row is None:
            fresh.append(t)
        elif domains is not None and dom != row.get("domain"):
            changed.append(t)
        elif row.get("note") and not is_auto_note(row.get("note")):
            changed.append(t)  # 손으로 뺐다가 제외 목록에서 지운 종목 — 다시 묻는다
        elif row.get("source") == "own":
            changed.append(t)  # 우리 그림을 두었다가 OWN_LOGO 에서 지운 종목 — 다시 묻는다
        elif code in PREFER_DOMAIN and row.get("source") != "domain":
            changed.append(t)  # 손으로 도메인 그림을 고른 종목 — 다시 묻는다
        elif recheck_all or only is not None or _parse_ts(row.get("checked_at")) < cutoff:
            stale.append((_parse_ts(row.get("checked_at")), t))
    stale.sort(key=lambda x: x[0])
    cap = {s["code"]: s.get("market_cap") or 0 for s in stocks}
    fresh.sort(key=lambda t: -cap[t["code"]])
    return (fresh + changed + [t for _ts, t in stale])[:limit]


def _parse_ts(v: str | None) -> datetime:
    if not v:
        return datetime.min.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(v.replace("Z", "+00:00"))


def decide(target: dict, ticker: tuple, domain: tuple | None, prefer_domain: bool = False) -> dict | None:
    """물어본 결과 → 표에 적을 행. 판정을 못 내리면(오류 · 한도) None — 예전 행을 그대로 둔다.

    `ticker` · `domain` 은 (상태, 그림 sha256, 선명도[, 그림, 경계 가파름]). 상태 200 = 있음 · 404 = 없음 · 그 밖 = 오류.
    domain 은 안 물었으면 None. 선명도는 도메인 그림만 잰다(None 이면 못 잰 것 — 거르지 않는다).
    `prefer_domain`(손 설정 PREFER_DOMAIN)이면 티커가 있어도 도메인 그림을 먼저 쓴다. 흐린 원본은 note(BLUR_SOURCE_NOTE)를 단다.
    """
    base = {"code": target["code"], "market": target["market"], "domain": target["domain"], "note": None}
    if prefer_domain and domain is not None and domain[0] == 200 and not (domain[2] is not None and domain[2] < BLUR_MAX):
        return {**base, "source": "domain", "digest": domain[1], "note": BLUR_SOURCE_NOTE if is_blurry(domain) else None}
    st, digest, _sharp = ticker[:3]
    if st == 200:
        return {**base, "source": "ticker", "digest": digest, "note": BLUR_SOURCE_NOTE if is_blurry(ticker) else None}
    if st != 404:
        return None
    if domain is None:
        return {**base, "source": "none", "digest": None}
    st, digest, sharp = domain[:3]
    if st == 200 and sharp is not None and sharp < BLUR_MAX:
        return {**base, "source": "none", "digest": digest, "note": BLUR_NOTE}
    if st == 200:
        return {**base, "source": "domain", "digest": digest, "note": BLUR_SOURCE_NOTE if is_blurry(domain) else None}
    if st != 404:
        return None
    return {**base, "source": "none", "digest": None}


def is_blurry(probed: tuple) -> bool:
    """물어본 결과(상태, sha256, 선명도, 그림, 경계 가파름)가 흐린 원본인가. 경계 가파름을 못 쟀으면 아니다."""
    steep = probed[4] if len(probed) > 4 else None
    return steep is not None and steep < STEEP_MIN


def generic_digests(rows: list[dict]) -> set[str]:
    """여러 회사(GENERIC_MIN 곳 이상)에 같은 그림이 나온 sha256 — 기본 아이콘이다. 도메인으로 받은 행만 센다
    (티커로 받은 그림은 logo.dev 가 회사에 붙여 둔 것이라 같은 그룹사가 같은 로고를 쓰는 일이 정상이다)."""
    codes: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        # 이미 기본 아이콘으로 돌린 행도 센다 — 안 세면 다음 주에 같은 그림을 받은 넷째 회사가 혼자라 안 걸린다.
        if r.get("digest") and (r.get("source") == "domain" or r.get("note") == GENERIC_NOTE):
            codes[r["digest"]].add(r["code"])
    return {d for d, cs in codes.items() if len(cs) >= GENERIC_MIN}


def apply_filters(rows: dict[str, dict], stocks: list[dict]) -> list[dict]:
    """기본 아이콘 · 손으로 뺀 종목을 none 으로 돌린다. 바뀐 행만 돌려준다(이미 none 이면 그대로)."""
    changed: list[dict] = []
    generic = generic_digests(list(rows.values()))
    market_of = {s["code"]: s["market"] for s in stocks}
    for code, reason in EXCLUDE.items():
        r = rows.get(code)
        if code not in market_of or code in OWN_LOGO:
            continue
        if r is None or r.get("source") != "none" or r.get("note") != reason:
            rows[code] = {**(r or {"code": code, "market": market_of[code], "domain": None, "digest": None}), "source": "none", "note": reason}
            changed.append(rows[code])
    for code, r in rows.items():
        if r.get("source") == "domain" and r.get("digest") in generic and code not in EXCLUDE:
            rows[code] = {**r, "source": "none", "note": GENERIC_NOTE}
            changed.append(rows[code])
    return changed


def sharpness(pixels: list[tuple[int, int, int]], size: int) -> float:
    """size×size RGB 픽셀(흰 바탕에 얹은 것)에서 이웃 픽셀 색 차이가 BLUR_EDGE 를 넘는 자리의 비율(가로 · 세로 이웃 모두)."""
    def far(a: tuple, b: tuple) -> bool:
        return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2])) > BLUR_EDGE

    n = 0
    for y in range(size):
        for x in range(size):
            p = pixels[y * size + x]
            if x + 1 < size and far(p, pixels[y * size + x + 1]):
                n += 1
            if y + 1 < size and far(p, pixels[(y + 1) * size + x]):
                n += 1
    return n / (2 * size * (size - 1))


def png_sharpness(body: bytes) -> float | None:
    """그림 바이트의 선명도(sharpness). Pillow 가 없거나 그림을 못 읽으면 None — 그때는 흐림으로 거르지 않는다."""
    try:
        import io

        from PIL import Image
    except ImportError:
        return None
    try:
        im = Image.open(io.BytesIO(body)).convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        raw = bg.convert("RGB").resize((SIZE, SIZE)).tobytes()  # getdata 는 Pillow 14 에서 빠진다(12 에서 경고)
        return sharpness([tuple(raw[i : i + 3]) for i in range(0, len(raw), 3)], SIZE)
    except Exception:  # noqa: BLE001 — 깨진 그림은 재지 않는다
        return None


def steepness(body: bytes) -> float | None:
    """128px(흰 바탕)에서 이웃 픽셀 밝기 차이 상위 1% 의 평균 — 가장 날카로운 경계가 얼마나 가파른가. 못 재면 None.
    작은 원본을 키운 그림은 경계가 몇 픽셀에 걸쳐 완만해 이 값이 작다(STEEP_MIN)."""
    try:
        import io

        import numpy as np
        from PIL import Image
    except ImportError:
        return None
    try:
        im = Image.open(io.BytesIO(body)).convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        g = np.asarray(bg.convert("L").resize((PROBE_SIZE, PROBE_SIZE))).astype(np.int16)
        d = np.concatenate([np.abs(np.diff(g, axis=1)).ravel(), np.abs(np.diff(g, axis=0)).ravel()])
        top = np.sort(d)[-max(10, len(d) // 100):]
        return round(float(top.mean()), 1)
    except Exception:  # noqa: BLE001 — 깨진 그림은 재지 않는다
        return None


class RateLimited(Exception):
    pass


def fetch_logo(path: str, key: str, size: int = SIZE) -> tuple[int, bytes | None]:
    """logo.dev 에 한 번 묻는다 → (상태, 그림 바이트). 없는 로고는 fallback=404 라 404 로 온다. 429 는 한 번 기다렸다 다시."""
    url = f"{LOGO_URL}{path}?token={key}&size={size}&format=png&fallback=404"
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "hatzze/1.0 (+https://hatzze.fun)"}), timeout=20) as r:
                body = r.read()
                if not (r.headers.get("content-type") or "").startswith("image/"):
                    return -1, None
                return 200, body
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt == 1:
                wait = int(e.headers.get("Retry-After") or 60)
                print(f"[로고] 분당 한도(429) — {wait}초 기다렸다 다시 묻습니다")
                time.sleep(wait + 1)
                continue
            if e.code == 429:
                raise RateLimited() from e
            return e.code, None
        except Exception as e:  # noqa: BLE001 — 끊김 · 타임아웃은 이 종목만 다음 실행으로 미룬다
            print(f"[로고] {path} 요청 실패: {type(e).__name__}")
            return -1, None
    return -1, None


def is_blank(body: bytes) -> bool:
    """한 색뿐인 그림인가 — logo.dev 가 로고 대신 새까만 네모를 주는 종목이 있다(039440 · 357120, 어느 크기로 받아도 · 2026-10-19).
    미리곱 RGBA 로 픽셀 99.5% 가 평균색에서 8 안쪽이면 그렇다(lib/logo-crisp.ts isBlank 와 같은 셈). 못 읽으면 아니다."""
    try:
        import io

        import numpy as np
        from PIL import Image
    except ImportError:
        return False
    try:
        a = np.asarray(Image.open(io.BytesIO(body)).convert("RGBA")).astype(float)
    except Exception:  # noqa: BLE001
        return False
    p = np.concatenate([a[..., :3] * a[..., 3:4] / 255, a[..., 3:4]], axis=2).reshape(-1, 4)
    return bool((np.abs(p - p.mean(axis=0)).max(axis=1) > 8).mean() < 0.005)


def probe(path: str, key: str, measure: bool = False) -> tuple[int, str | None, float | None, bytes | None, float | None]:
    """logo.dev 에 한 번 묻는다 → (상태, 그림 sha256, 선명도, 그림, 경계 가파름). 선명도는 measure 일 때만(도메인 그림),
    경계 가파름(흐린 원본)은 늘 잰다. 한 색뿐인 그림은 없는 것(404)으로 돌려 도메인을 묻게 한다."""
    st, body = fetch_logo(path, key, PROBE_SIZE)
    if st != 200 or body is None:
        return st, None, None, None, None
    if is_blank(body):
        return 404, None, None, None, None
    return 200, hashlib.sha256(body).hexdigest(), (png_sharpness(body) if measure else None), body, steepness(body)


def crop_for(code: str, body: bytes | None, path: str, key: str) -> list[float] | None:
    """화면에 쓸 그림이 가로로 긴 로고면 잘라 쓸 상자, 아니면 [](자르지 않는다). 손 설정(CROP_OVERRIDE)이 먼저다.
    긴 로고면 SHAPE_SIZE 그림을 한 번 더 받아 첫 덩어리를 잰다(common/logo_shape.piece_box). 못 재면 None — 다음 실행에 다시."""
    if code in CROP_OVERRIDE:
        return CROP_OVERRIDE[code]
    wide = is_wide(body) if body else None
    if wide is None:
        return None
    if not wide:
        return []
    st, big = fetch_logo(path, key, SHAPE_SIZE)
    time.sleep(PACE_SEC)
    if st != 200 or big is None:
        return None
    box = piece_box(big)
    if not box:
        return []
    piece = square_png(big, SIZE, box)
    sharp = png_sharpness(piece) if piece else None
    return [] if sharp is not None and sharp < CROP_BLUR_MAX else box


def logo_path(row: dict) -> str | None:
    """판정 행이 logo.dev 에 묻는 길 — /api/logo 의 logoUpstreamPath 와 같다."""
    if row.get("source") == "ticker":
        return f"ticker/{row['code']}.{MARKETS[row['market']]}"
    if row.get("source") == "domain" and row.get("domain"):
        return row["domain"]
    return None


# 회사 홈페이지 그림을 받을 때. 사이트마다 인증서가 낡거나 사슬이 빠진 곳이 많아 검증을 끈다 — 공개 그림을 읽기만 하고,
# 받은 그림은 사람이 고른 주소(OWN_LOGO)의 것이며 다듬은 뒤 판정표에 둔다.
_LOOSE_SSL = ssl.create_default_context()
_LOOSE_SSL.check_hostname = False
_LOOSE_SSL.verify_mode = ssl.CERT_NONE
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"


def own_image(url: str, box: list[float] | None) -> tuple[str, str] | None:
    """홈페이지 그림 → (base64 PNG 또는 SVG 문서, sha256). PNG 는 정사각형으로 다듬는다(긴 로고면 box 또는 첫 덩어리). 못 받으면 None."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": BROWSER_UA}), timeout=20, context=_LOOSE_SSL) as r:
            body = r.read(5_000_000)
    except Exception as e:  # noqa: BLE001 — 사이트가 잠깐 안 열리면 예전 그림을 그대로 둔다
        print(f"[로고] 홈페이지 그림을 못 받았습니다 {url}: {type(e).__name__}")
        return None
    if is_svg(body):
        # Pillow 는 SVG 를 못 읽는다 — 문서 그대로 두고 /api/logo 가 그림으로 바꿔 상자(crop 칸)대로 자른다. 그래서 SVG 는
        # 첫 덩어리를 스스로 못 찾는다(box 를 손으로 적는다 · None 이면 통째). 2026-10-20 홈페이지 로고가 SVG 뿐인 곳 40.
        if len(body) > SVG_MAX:
            print(f"[로고] SVG 가 너무 큽니다({len(body):,}바이트) {url}")
            return None
        return base64.b64encode(body).decode("ascii"), hashlib.sha256(body).hexdigest()
    png = square_png(body, OWN_SIZE, box)
    if png is None:
        return None
    return base64.b64encode(png).decode("ascii"), hashlib.sha256(png).hexdigest()


def main() -> None:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    limit = int(args[args.index("--max") + 1]) if "--max" in args else MAX_PROBES
    recheck_all = "--recheck" in args  # 판정 규칙을 바꾼 뒤 모든 행을 한 번 다시 묻는다
    only = set(args[args.index("--codes") + 1].split(",")) if "--codes" in args else None  # 몇 종목만 다시 묻는다
    key = os.environ.get("LOGO_DEV_KEY") or os.environ.get("NEXT_PUBLIC_LOGO_DEV_KEY")
    if not key:
        print("[로고] LOGO_DEV_KEY 가 없어 건너뜁니다(GitHub Actions 시크릿 · .env.local).")
        return

    db = get_client()
    stocks = [s for s in load_all(db, "stocks", "code,market,market_cap", order_by="code") if s.get("market") in MARKETS]
    base_cols = "code,market,source,domain,digest,checked_at,note"
    # 마이그레이션 104(crop · image · image_src) 전이면 다듬기는 건너뛰고 103 처럼만 돈다.
    has_shape = True
    try:
        existing = {r["code"]: r for r in load_all(db, TABLE, base_cols + ",crop,image_src", order_by="code")}
    except Exception:  # noqa: BLE001
        has_shape = False
        try:
            existing = {r["code"]: r for r in load_all(db, TABLE, base_cols, order_by="code")}
        except Exception as e:  # noqa: BLE001 — 표가 없으면(마이그레이션 103 전) 적을 곳이 없다
            print(f"[로고] {TABLE} 를 못 읽었습니다({type(e).__name__}) — 마이그레이션 103 을 먼저 실행하세요.")
            if not dry_run:
                return
            existing = {}
    if not has_shape:
        print("[로고] 마이그레이션 104 전이라 긴 로고 자르기 · 우리 그림은 건너뜁니다.")

    page = get_page(KIND_URL, encoding="euc-kr")
    domains = parse_kind(page) if page else None
    if domains is not None and len(domains) < MIN_KIND_ROWS:
        print(f"[로고] 상장회사 목록이 {len(domains)}곳뿐 — 페이지가 바뀐 것 같아 홈페이지를 쓰지 않습니다")
        domains = None
    with_dom = sum(1 for s in stocks if (domains or {}).get(s["code"]))
    print(f"[로고] 국장 {len(stocks):,}종목 · 표 {len(existing):,}행 · KIND {'못 받음' if domains is None else f'{len(domains):,}곳(도메인 있는 국장 종목 {with_dom:,})'}")

    now = datetime.now(timezone.utc)
    targets = pick_targets(stocks, existing, domains, now, limit, recheck_all, only)
    print(f"[로고] 이번에 물을 종목 {len(targets)} (상한 {limit})")

    rows = dict(existing)
    written: dict[str, dict] = {}
    counts: dict[str, int] = defaultdict(int)
    blurry: list[str] = []  # 흐린 원본 — 손 보충 후보(config/stock_logo_shape.py)라 로그에 남긴다
    try:
        for i, t in enumerate(targets, 1):
            ticker = probe(f"ticker/{t['code']}.{MARKETS[t['market']]}", key)
            time.sleep(PACE_SEC)
            dom = None
            # 티커가 없거나 손으로 도메인을 고른 종목(PREFER_DOMAIN)은 도메인도 묻는다.
            prefer = t["code"] in PREFER_DOMAIN
            if t["domain"] and (ticker[0] == 404 or prefer):
                dom = probe(t["domain"], key, measure=True)
                time.sleep(PACE_SEC)
            row = decide(t, ticker, dom, prefer)
            if row is None:
                counts["미룸"] += 1
                continue
            if row.get("note") == BLUR_SOURCE_NOTE:
                blurry.append(t["code"])
            row["checked_at"] = now.isoformat()
            if has_shape:
                got = ticker if row["source"] == "ticker" else dom
                row["crop"] = crop_for(t["code"], got[3] if got else None, logo_path(row), key) if row["source"] in ("ticker", "domain") else []
                if (existing.get(t["code"]) or {}).get("source") == "own":
                    row["image"] = row["image_src"] = None  # 우리 그림을 두었다가 다시 logo.dev 로 — 그림을 지운다
            rows[t["code"]] = written[t["code"]] = row
            counts[row["source"]] += 1
            if i % 200 == 0:
                print(f"[로고] {i}/{len(targets)} · " + " · ".join(f"{k} {v}" for k, v in sorted(counts.items())))
        if has_shape:
            # 자를 상자를 아직 안 잰 행(103 때 판정한 것 · 손 설정을 고친 것) — 남은 몫만큼, 시가총액 큰 순으로.
            cap = {s["code"]: s.get("market_cap") or 0 for s in stocks}
            todo = sorted(
                (r for c, r in rows.items() if c not in written and r.get("source") in ("ticker", "domain")
                 and (r.get("crop") is None or (c in CROP_OVERRIDE and r.get("crop") != CROP_OVERRIDE[c]))),
                key=lambda r: -cap.get(r["code"], 0),
            )[: max(0, limit - len(targets))]
            for r in todo:
                c = r["code"]
                if c in CROP_OVERRIDE:
                    crop = CROP_OVERRIDE[c]
                else:
                    st, body = fetch_logo(logo_path(r), key)
                    time.sleep(PACE_SEC)
                    crop = crop_for(c, body if st == 200 else None, logo_path(r), key) if st in (200, 404) else None
                if crop is None:
                    continue
                rows[c] = written[c] = {**r, "crop": crop}
                counts["상자" if crop else "상자 없음"] += 1
            # 우리 그림 — 주소나 상자가 바뀐 것만 다시 받는다.
            market_of = {s["code"]: s["market"] for s in stocks}
            for c, (url, box) in OWN_LOGO.items():
                r = rows.get(c) or {}
                if c not in market_of or (r.get("source") == "own" and r.get("image_src") == url and r.get("crop") == (box or [])):
                    continue
                got = own_image(url, box)
                if got is None:
                    continue
                image, digest = got
                rows[c] = written[c] = {
                    "code": c, "market": market_of[c], "source": "own", "domain": r.get("domain"), "digest": digest,
                    "note": None, "crop": box or [], "image": image, "image_src": url, "checked_at": now.isoformat(),
                }
                counts["우리 그림"] += 1
    except RateLimited:
        print("[로고] 다시 물어도 429 — 여기서 멈추고 물어본 데까지만 적습니다")

    for r in apply_filters(rows, stocks):
        written[r["code"]] = r
    filtered = sum(1 for r in written.values() if r.get("source") == "none" and r.get("note"))
    print("[로고] 판정 " + " · ".join(f"{k} {v}" for k, v in sorted(counts.items())) + f" · 거름 {filtered} · 적을 행 {len(written)}")
    if blurry:
        cap = {s["code"]: s.get("market_cap") or 0 for s in stocks}
        blurry.sort(key=lambda c: -cap.get(c, 0))
        print(f"[로고] 흐린 원본 {len(blurry)}곳(시가총액 순 · 손 보충은 config/stock_logo_shape.py PREFER_DOMAIN · OWN_LOGO): " + " · ".join(blurry[:40]))

    if dry_run:
        groups: dict[str, list[str]] = defaultdict(list)
        for r in rows.values():
            if r.get("note") == GENERIC_NOTE:
                groups[r["digest"]].append(f"{r['code']}({r.get('domain')})")
        for d, members in groups.items():
            print(f"  [기본 아이콘 {d[:8]}] {len(members)}곳: " + " · ".join(members[:6]))
        by = defaultdict(int)
        for r in written.values():
            by[(r["market"], r["source"])] += 1
        print("[dry-run] " + " · ".join(f"{m} {s} {n}" for (m, s), n in sorted(by.items())) + " — 적지 않고 끝냅니다.")
        return
    # ⚠️ 여러 행을 한 번에 upsert 하면 모든 행이 같은 칸을 가져야 한다(빠진 칸은 null 로 들어간다). 그래서 그림 칸(image)이
    #    있는 행과 없는 행을 따로 쓴다 — 함께 쓰면 그림을 안 건드린 행이 우리 그림을 지운다.
    cols = ["code", "market", "source", "domain", "digest", "note", "checked_at"] + (["crop", "image_src"] if has_shape else [])
    plain, with_image = [], []
    for r in written.values():
        row = {k: r.get(k) for k in cols} | {"checked_at": r.get("checked_at") or now.isoformat()}
        if has_shape and "image" in r:
            with_image.append(row | {"image": r["image"]})
        else:
            plain.append(row)
    for group in (plain, with_image):
        for i in range(0, len(group), 500):
            execute_with_retry(db.table(TABLE).upsert(group[i : i + 500], on_conflict="code"))
    payload = plain + with_image
    total = defaultdict(int)
    for r in rows.values():
        total[(r.get("market"), r.get("source"))] += 1
    print(f"[Supabase] {TABLE} {len(payload)}행 적음 · 표 전체 " + " · ".join(f"{m} {s} {n}" for (m, s), n in sorted(total.items(), key=str)))


if __name__ == "__main__":
    main()
