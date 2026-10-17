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

import hashlib
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.kind import get_page, rows_of  # noqa: E402
from common.supabase_client import execute_with_retry, get_client, load_all  # noqa: E402
from config.stock_logo_exclude import EXCLUDE  # noqa: E402

TABLE = "stock_logo_source"
# 상장회사 목록 전체(코스피 · 코스닥 · 코넥스). EUC-KR HTML 표 — 회사명 · 시장구분 · 종목코드 · 업종 · 주요제품 · 상장일 ·
# 결산월 · 대표자명 · 홈페이지 · 지역.
KIND_URL = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13"
# 이보다 적으면 페이지가 바뀐 것으로 보고 홈페이지를 쓰지 않는다(2026-10-18 코스닥만 1,819).
MIN_KIND_ROWS = 2000
LOGO_URL = "https://img.logo.dev/"
SIZE = 64
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
AUTO_NOTES = (GENERIC_NOTE, BLUR_NOTE)


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


def pick_targets(stocks: list[dict], existing: dict[str, dict], domains: dict[str, str | None] | None, now: datetime, limit: int) -> list[dict]:
    """이번에 물어볼 종목(새 종목 → 도메인 바뀐 종목 → 오래된 종목 순). 손으로 뺀 종목은 묻지 않는다(apply_filters 가 맡는다).

    새 종목은 시가총액이 큰 순이다 — 처음 채울 때 실행 상한에 걸려도 화면에 자주 나오는 종목부터 채워진다.

    `domains` 가 None 이면(KIND 를 못 받음) 표의 도메인을 그대로 쓰고, 도메인 바뀜은 따지지 않는다.
    """
    fresh, changed, stale = [], [], []
    cutoff = now - timedelta(days=RECHECK_DAYS)
    for s in stocks:
        code = s["code"]
        if code in EXCLUDE:
            continue
        row = existing.get(code)
        dom = (domains.get(code) if domains is not None else (row or {}).get("domain"))
        t = {"code": code, "market": s["market"], "domain": dom}
        if row is None:
            fresh.append(t)
        elif domains is not None and dom != row.get("domain"):
            changed.append(t)
        elif row.get("note") and row.get("note") not in AUTO_NOTES:
            changed.append(t)  # 손으로 뺐다가 제외 목록에서 지운 종목 — 다시 묻는다
        elif _parse_ts(row.get("checked_at")) < cutoff:
            stale.append((_parse_ts(row.get("checked_at")), t))
    stale.sort(key=lambda x: x[0])
    cap = {s["code"]: s.get("market_cap") or 0 for s in stocks}
    fresh.sort(key=lambda t: -cap[t["code"]])
    return (fresh + changed + [t for _ts, t in stale])[:limit]


def _parse_ts(v: str | None) -> datetime:
    if not v:
        return datetime.min.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(v.replace("Z", "+00:00"))


def decide(target: dict, ticker: tuple, domain: tuple | None) -> dict | None:
    """물어본 결과 → 표에 적을 행. 판정을 못 내리면(오류 · 한도) None — 예전 행을 그대로 둔다.

    `ticker` · `domain` 은 (상태, 그림 sha256, 선명도). 상태 200 = 있음 · 404 = 없음 · 그 밖 = 오류. domain 은 안 물었으면 None.
    선명도는 도메인 그림만 잰다(None 이면 못 잰 것 — 거르지 않는다).
    """
    base = {"code": target["code"], "market": target["market"], "domain": target["domain"], "note": None}
    st, digest, _sharp = ticker
    if st == 200:
        return {**base, "source": "ticker", "digest": digest}
    if st != 404:
        return None
    if domain is None:
        return {**base, "source": "none", "digest": None}
    st, digest, sharp = domain
    if st == 200 and sharp is not None and sharp < BLUR_MAX:
        return {**base, "source": "none", "digest": digest, "note": BLUR_NOTE}
    if st == 200:
        return {**base, "source": "domain", "digest": digest}
    if st != 404:
        return None
    return {**base, "source": "none", "digest": None}


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
        if code not in market_of:
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
        px = bg.convert("RGB").resize((SIZE, SIZE))
        return sharpness(list(px.getdata()), SIZE)
    except Exception:  # noqa: BLE001 — 깨진 그림은 재지 않는다
        return None


class RateLimited(Exception):
    pass


def probe(path: str, key: str, measure: bool = False) -> tuple[int, str | None, float | None]:
    """logo.dev 에 한 번 묻는다 → (상태, 그림 sha256, 선명도). 없는 로고는 fallback=404 라 404 로 온다.
    선명도는 measure 일 때만 잰다(도메인 그림)."""
    url = f"{LOGO_URL}{path}?token={key}&size={SIZE}&format=png&fallback=404"
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "hatzze/1.0 (+https://hatzze.fun)"}), timeout=20) as r:
                body = r.read()
                if not (r.headers.get("content-type") or "").startswith("image/"):
                    return -1, None, None
                return 200, hashlib.sha256(body).hexdigest(), (png_sharpness(body) if measure else None)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt == 1:
                wait = int(e.headers.get("Retry-After") or 60)
                print(f"[로고] 분당 한도(429) — {wait}초 기다렸다 다시 묻습니다")
                time.sleep(wait + 1)
                continue
            if e.code == 429:
                raise RateLimited() from e
            return e.code, None, None
        except Exception as e:  # noqa: BLE001 — 끊김 · 타임아웃은 이 종목만 다음 실행으로 미룬다
            print(f"[로고] {path} 요청 실패: {type(e).__name__}")
            return -1, None, None
    return -1, None, None


def main() -> None:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    limit = int(args[args.index("--max") + 1]) if "--max" in args else MAX_PROBES
    key = os.environ.get("LOGO_DEV_KEY") or os.environ.get("NEXT_PUBLIC_LOGO_DEV_KEY")
    if not key:
        print("[로고] LOGO_DEV_KEY 가 없어 건너뜁니다(GitHub Actions 시크릿 · .env.local).")
        return

    db = get_client()
    stocks = [s for s in load_all(db, "stocks", "code,market,market_cap", order_by="code") if s.get("market") in MARKETS]
    try:
        existing = {r["code"]: r for r in load_all(db, TABLE, "code,market,source,domain,digest,checked_at,note", order_by="code")}
    except Exception as e:  # noqa: BLE001 — 표가 없으면(마이그레이션 103 전) 적을 곳이 없다
        print(f"[로고] {TABLE} 를 못 읽었습니다({type(e).__name__}) — 마이그레이션 103 을 먼저 실행하세요.")
        if not dry_run:
            return
        existing = {}

    page = get_page(KIND_URL, encoding="euc-kr")
    domains = parse_kind(page) if page else None
    if domains is not None and len(domains) < MIN_KIND_ROWS:
        print(f"[로고] 상장회사 목록이 {len(domains)}곳뿐 — 페이지가 바뀐 것 같아 홈페이지를 쓰지 않습니다")
        domains = None
    with_dom = sum(1 for s in stocks if (domains or {}).get(s["code"]))
    print(f"[로고] 국장 {len(stocks):,}종목 · 표 {len(existing):,}행 · KIND {'못 받음' if domains is None else f'{len(domains):,}곳(도메인 있는 국장 종목 {with_dom:,})'}")

    now = datetime.now(timezone.utc)
    targets = pick_targets(stocks, existing, domains, now, limit)
    print(f"[로고] 이번에 물을 종목 {len(targets)} (상한 {limit})")

    rows = dict(existing)
    written: dict[str, dict] = {}
    counts: dict[str, int] = defaultdict(int)
    try:
        for i, t in enumerate(targets, 1):
            ticker = probe(f"ticker/{t['code']}.{MARKETS[t['market']]}", key)
            time.sleep(PACE_SEC)
            dom = None
            if ticker[0] == 404 and t["domain"]:
                dom = probe(t["domain"], key, measure=True)
                time.sleep(PACE_SEC)
            row = decide(t, ticker, dom)
            if row is None:
                counts["미룸"] += 1
                continue
            row["checked_at"] = now.isoformat()
            rows[t["code"]] = written[t["code"]] = row
            counts[row["source"]] += 1
            if i % 200 == 0:
                print(f"[로고] {i}/{len(targets)} · " + " · ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    except RateLimited:
        print("[로고] 다시 물어도 429 — 여기서 멈추고 물어본 데까지만 적습니다")

    for r in apply_filters(rows, stocks):
        written[r["code"]] = r
    filtered = sum(1 for r in written.values() if r.get("source") == "none" and r.get("note"))
    print("[로고] 판정 " + " · ".join(f"{k} {v}" for k, v in sorted(counts.items())) + f" · 거름 {filtered} · 적을 행 {len(written)}")

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
    payload = [
        {k: r.get(k) for k in ("code", "market", "source", "domain", "digest", "note")} | {"checked_at": r.get("checked_at") or now.isoformat()}
        for r in written.values()
    ]
    for i in range(0, len(payload), 500):
        execute_with_retry(db.table(TABLE).upsert(payload[i : i + 500], on_conflict="code"))
    total = defaultdict(int)
    for r in rows.values():
        total[(r.get("market"), r.get("source"))] += 1
    print(f"[Supabase] {TABLE} {len(payload)}행 적음 · 표 전체 " + " · ".join(f"{m} {s} {n}" for (m, s), n in sorted(total.items(), key=str)))


if __name__ == "__main__":
    main()
