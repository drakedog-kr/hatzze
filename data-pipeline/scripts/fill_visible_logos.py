"""화면에 뜬 국장 종목 중 로고가 없는 곳을 회사 홈페이지 그림으로 채운다(아침 · 저녁 화면 비우기 뒤 · 2026-10-21).

## 왜

logo.dev 에 없는 국장 종목은 손 설정(config/stock_logo_shape.py OWN_LOGO)으로 채워 왔는데, 화면에 새로 오르는 소형주 · 새 상장주가
날마다 머리글자 배지로 떴다(10-19 저녁 12곳 · 10-20 13곳). 화면이 다 나간 뒤 그 종목만 골라 손으로 하던 순서 그대로 채운다.

## 흐름

1. 운영 화면(홈 · 카더라 · 미리보기 · 배당 · 노트 · MDD · 테마 목록과 국장 테마 상세)의 HTML 에서 /api/logo 주소의 국장 종목을
   모은다. 화면이 실제로 그린 목록이라 화면 계산을 따라 하지 않는다. 우선주 · 스팩은 화면이 이미 보통주 · 증권사 코드로 바꿔 둔다.
2. 판정표(stock_logo_source)가 none 인 종목만 고른다. 손 설정(OWN_LOGO · EXCLUDE)에 있거나 MISS_DAYS 안에 못 채운 종목은 넘기고,
   한 번에 MAX_TARGETS 곳까지만(연휴 뒤처럼 몰리는 날 — 남은 곳은 다음 실행으로).
3. 홈페이지(common/homepage_logo.py)에서 로고 후보를 받아 한 장의 판으로 붙이고, Claude(Opus · 구독 경로)에게 회사 이름 · 홈페이지
   제목과 함께 보여 그 회사 로고인 후보를 고르게 한다. 홈페이지가 다른 회사 사이트로 보이면 아무것도 안 고른다(덕양에너젠
   dyenergen.com 이 동광마켓 사이트였다). 사람이 판정한 100곳 표본에서 Sonnet 은 다른 회사 로고를 한 번도 안 골랐다(10-20).
4. 고른 후보 중 화면 배지 규칙(app/StockLogo.tsx unreadableMark)을 통과하고 정사각형에 가까운 것을 코드가 고른다 — Claude 는 글자까지
   든 전체 로고를 고르는 경향이 있다. 긴 로고는 손 설정과 같이 첫 덩어리를 자른다(common/logo_shape.square_png).
5. 판정표에 source own · note AUTO_OWN_NOTE 로 적는다. 아침 로고 잡(refresh_stock_logo_sources.py)은 이 행을 다시 묻지 않는다.
   틀렸으면 config/stock_logo_exclude.py 에 한 줄 적으면 다음 아침에 배지로 돌아가고, 손 설정(OWN_LOGO)을 적으면 그것이 이긴다.
   못 채운 종목은 note 에 AUTO_MISS_PREFIX + 이유 + 날짜를 적는다(실행 요약 표에도 남는다).

## 하지 않는 것

- logo.dev 에 묻지 않는다(그림을 판정표에 둘 수 없다 — 도메인 그림은 손 설정 DOMAIN_OVERRIDE 의 몫).
- SVG 뿐인 홈페이지 · 긴 글자 로고뿐인 곳 · 러너(미국)에서 안 열리는 사이트(10-20 국내 홈페이지 그림의 10% 남짓)는 못 채운다.
- 구독 경로가 막혀 API(Haiku)로 넘어간 판정은 쓰지 않는다 — 그 모델로는 정확도를 재지 않았다. 구독 토큰이 없으면 통째로 건너뛴다.

돌리는 법: `python data-pipeline/scripts/fill_visible_logos.py [--dry-run] [--codes 456160,226340]`
--codes 를 주면 화면 목록 대신 그 종목만 보고, 최근에 못 채운 종목도 다시 본다.
로컬에서는 --dry-run 으로만 돌린다(운영 판정표에 쓰지 않고, 무엇을 쓸지만 찍는다).
"""

from __future__ import annotations

import base64
import hashlib
import io
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.config import ANTHROPIC_API_KEY  # noqa: E402
from common.homepage_logo import download_candidates, logo_candidates, naver_homepage, open_homepage, site_names  # noqa: E402
from common.llm_client import SubscriptionClient, get_llm_client  # noqa: E402
from common.logo_shape import square_png  # noqa: E402
from common.supabase_client import execute_with_retry, get_client, load_all  # noqa: E402
from config.stock_logo_exclude import EXCLUDE  # noqa: E402
from config.stock_logo_shape import OWN_LOGO  # noqa: E402
from refresh_stock_logo_sources import AUTO_MISS_PREFIX, AUTO_OWN_NOTE, OWN_SIZE, TABLE, domain_of  # noqa: E402

SITE = (os.environ.get("LOGO_FILL_SITE") or "https://hatzze.fun").rstrip("/")
# 국장 종목 로고가 뜨는 화면. 테마 상세(/theme/<영문>)는 /theme 목록에서 링크를 따라 찾는다(미장 테마 /theme/us/... 는 미국 종목뿐).
SCREENS = ["/", "/kadera", "/preview", "/dividend", "/daily", "/mdd", "/theme"]
MAX_TARGETS = 20
MISS_DAYS = 7          # 못 채운 종목은 이만큼 지나야 다시 본다(홈페이지가 바뀌었을 수 있다)
JUDGE_MODEL = "claude-opus-5-5"
ASPECT_MAX = 4.8       # 칸 폭에 얹으면 세로가 20% 아래로 — 화면이 배지로 바꾼다(StockLogo unreadableMark)
DARK_MIN = 0.02        # 잉크 가운데 어두운 픽셀(R+G+B < 600)이 이보다 적으면 흰 로고 — 화면이 배지로 바꾼다
WORKERS = 6

LOGO_RE = re.compile(r"/api/logo/([0-9A-Z]{6})\.(?:KS|KQ)")
THEME_RE = re.compile(r'href="(/theme/(?!us\b)[a-z0-9-]+)"')

SYSTEM = """당신은 한국 상장회사 로고 판정자입니다. 회사 홈페이지에서 자동으로 긁어 온 그림 후보(#0, #1, …)를 한 장에 붙인 판을 보고,
그 회사 자신의 로고인 후보 번호를 모두 고릅니다.

고르는 기준(모두 맞아야 고릅니다):
1. 그 회사 자신의 로고다 — 지금 이름과 맞는 글자나 그 회사의 심볼. 영문 표기 · 약자도 됩니다(예: 대원전선 → DAEWON).
2. 고르지 않는 것: 옛 회사 이름이 적힌 로고, 다른 회사 · 거래처 · 고객사 · 인증 마크 · 협회 · 공공기관 로고, 계열 그룹만의 로고(회사 이름이
   다를 때), 제품 · 서비스 브랜드 로고(회사 이름과 다를 때), 사진 · 배너 · 화면 캡처, 홈페이지 제작 업체 · 호스팅 · 웹빌더 기본 그림
   (Gabia · cafe24 · WordPress 등), 일반 아이콘(집 · 사람 · 지구본), 회사와 상관없는 내용(도박 · 광고 등).
3. 흰색 글자뿐이라 회색 바탕에서 거의 안 보이는 그림은 고르지 않습니다.
4. 홈페이지 제목 · 그림의 글자로 보아 이 사이트가 다른 회사의 것이면 site_is_company 를 false 로 하고 아무것도 고르지 않습니다.
5. 확신이 없으면 고르지 않습니다 — 틀린 회사 로고를 화면에 내는 것이 로고가 없는 것보다 나쁩니다."""

SCHEMA = {
    "type": "object",
    "properties": {
        "site_is_company": {"type": "boolean"},
        "picks": {"type": "array", "items": {"type": "integer"}},
        "why": {"type": "string"},
    },
    "required": ["site_is_company", "picks", "why"],
    "additionalProperties": False,
}


# ── 1. 화면에 뜬 국장 종목 ─────────────────────────────────────────────────────

def get_html(path: str) -> str:
    # 운영 주소는 늘 ga=off — 이 요청은 자바스크립트를 안 돌려 GA 에 안 잡히지만, 혹시 그리는 쪽이 보더라도 빠지게 한다.
    sep = "&" if "?" in path else "?"
    req = urllib.request.Request(f"{SITE}{path}{sep}ga=off", headers={"User-Agent": "hatzze-logo-fill"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")


def screen_codes(html: str) -> set[str]:
    """화면 HTML 의 /api/logo/<코드>.KS|KQ 에서 국장 종목코드."""
    return set(LOGO_RE.findall(html))


def theme_paths(html: str) -> list[str]:
    """테마 목록 HTML 의 국장 테마 상세 주소(/theme/<영문>). 미장 테마(/theme/us/…)는 뺀다."""
    return sorted(set(THEME_RE.findall(html)) - {"/theme/us"})


def visible_codes() -> tuple[set[str], int]:
    """운영 화면이 그린 국장 종목 → (코드, 읽은 화면 수). 못 연 화면은 건너뛴다."""
    pages: dict[str, str] = {}

    def one(p: str) -> tuple[str, str | None]:
        try:
            return p, get_html(p)
        except Exception as e:  # noqa: BLE001 — 한 화면이 안 열려도 나머지로 간다
            print(f"[자동 로고] 화면을 못 열었습니다 {p}: {type(e).__name__}")
            return p, None

    with ThreadPoolExecutor(WORKERS) as ex:
        pages.update((p, h) for p, h in ex.map(one, SCREENS) if h)
        themes = theme_paths(pages.get("/theme", ""))
        pages.update((p, h) for p, h in ex.map(one, themes) if h)
    codes: set[str] = set()
    for h in pages.values():
        codes |= screen_codes(h)
    return codes, len(pages)


# ── 2. 채울 종목 ──────────────────────────────────────────────────────────────

def miss_date(note: str | None) -> datetime | None:
    """AUTO_MISS_PREFIX note 의 날짜. 아니면 None."""
    if not (note or "").startswith(AUTO_MISS_PREFIX):
        return None
    m = re.search(r"\((\d{4}-\d{2}-\d{2})\)\s*$", note or "")
    return datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc) if m else None


def pick_targets(codes: set[str], rows: dict[str, dict], now: datetime, only: set[str] | None = None) -> list[str]:
    """화면에 뜬 종목 중 이번에 채울 것. 판정표가 none 이고 손 설정에 없는 종목, 최근에 못 채운 것은 뺀다."""
    out = []
    for c in sorted(codes):
        if only is not None and c not in only:
            continue
        r = rows.get(c)
        if r is None or r.get("source") != "none" or c in OWN_LOGO or c in EXCLUDE:
            continue
        missed = miss_date(r.get("note"))
        if only is None and missed and now - missed < timedelta(days=MISS_DAYS):
            continue
        out.append(c)
    return out[:MAX_TARGETS]


# ── 3. 홈페이지 후보 ──────────────────────────────────────────────────────────

def gather(code: str, domain: str | None) -> dict:
    """홈페이지를 찾아 로고 후보를 받는다 → {domain, title, og, cands[], svg, miss}."""
    dom = domain or domain_of(naver_homepage(code))
    if not dom:
        return {"miss": "홈페이지 주소 없음"}
    page = open_homepage(dom)
    if page is None:
        return {"domain": dom, "miss": "홈페이지가 안 열림"}
    base, html = page
    title, og = site_names(html)
    cands, svg = download_candidates(logo_candidates(base, html))
    out = {"domain": dom, "title": title, "og": og, "cands": cands, "svg": svg}
    if not cands:
        out["miss"] = "SVG 로고뿐" if svg else "로고 후보 없음"
    return out


def sheet_png(cands: list[dict]) -> bytes:
    """후보를 밝은 회색 칸에 나란히 놓고 아래에 #번호를 적은 PNG(사람이 손으로 판정할 때 보던 판과 같은 꼴)."""
    from PIL import Image, ImageDraw, ImageFont

    cw, ch = 360, 200
    sheet = Image.new("RGB", (cw * len(cands), ch + 34), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=22)
    for i, c in enumerate(cands):
        im = Image.open(io.BytesIO(c["body"])).convert("RGBA")
        im.thumbnail((cw - 20, ch - 20))
        cell = Image.new("RGBA", (cw - 8, ch - 8), (232, 234, 237, 255))
        cell.alpha_composite(im, ((cw - 8 - im.width) // 2, (ch - 8 - im.height) // 2))
        sheet.paste(cell.convert("RGB"), (i * cw + 4, 4))
        draw.text((i * cw + 8, ch + 4), f"#{i}", fill=(0, 0, 0), font=font)
    out = io.BytesIO()
    sheet.save(out, "PNG")
    return out.getvalue()


# ── 4. 판정 ───────────────────────────────────────────────────────────────────

def judge(client, name: str, code: str, g: dict) -> dict | None:
    """Claude 판정 → {site_is_company, picks, why}. 구독 경로로 못 받았으면(API 폴백) None — 쓰지 않는다."""
    import json

    text = (
        f"회사: {name} (종목코드 {code}) · 홈페이지 {g['domain']} · 홈페이지 제목 '{g['title']}'"
        + (f" · 사이트 이름 '{g['og']}'" if g.get("og") else "")
        + f". 후보 {len(g['cands'])}장(#0~#{len(g['cands']) - 1}) 중 이 회사 자신의 로고 번호를 모두 고르세요."
    )
    image = {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.b64encode(sheet_png(g["cands"])).decode("ascii")}}
    if not client.enabled:
        return None  # 구독 경로가 이 실행에서 꺼졌다(연속 실패) — 부르면 곧장 API 로 간다
    before = client.calls_fallback
    resp = client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=800,
        system=SYSTEM,
        messages=[{"role": "user", "content": [image, {"type": "text", "text": text}]}],
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
    )
    if client.calls_fallback != before:
        return None
    try:
        data = json.loads(resp.content[0].text)
    except (ValueError, IndexError, AttributeError):
        return None
    picks = [p for p in data.get("picks") or [] if isinstance(p, int) and 0 <= p < len(g["cands"])]
    return {"site_is_company": bool(data.get("site_is_company")), "picks": picks, "why": str(data.get("why") or "")[:200]}


# ── 5. 칸에 맞는 판 ───────────────────────────────────────────────────────────

def screen_shape(body: bytes) -> tuple[bytes, float] | None:
    """칸에 얹을 PNG(OWN_SIZE 정사각형 · 긴 로고면 첫 덩어리)와 잉크 가로세로비. 화면이 배지로 바꿀 그림이면 None.
    흰 바탕은 /api/logo 가 걷으므로 잉크에서 뺀다(app/StockLogo.tsx unreadableMark 의 두 문턱)."""
    import numpy as np
    from PIL import Image

    png = square_png(body, OWN_SIZE, None)
    if png is None:
        return None
    a = np.asarray(Image.open(io.BytesIO(png)).convert("RGBA")).astype(int)
    opaque = a[..., 3] >= 200
    ink = opaque & ~(a[..., :3].min(axis=2) > 235)
    if not ink.any():
        return None
    dark = ink & (a[..., :3].sum(axis=2) < 600)
    if dark.sum() / ink.sum() < DARK_MIN:
        return None
    ys, xs = np.nonzero(ink)
    aspect = (xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1)
    if aspect > ASPECT_MAX:
        return None
    return png, float(aspect)


def choose(cands: list[dict], picks: list[int]) -> tuple[dict, bytes] | None:
    """Claude 가 고른 후보 중 칸에서 읽히고 정사각형에 가까운 것 → (후보, PNG). 없으면 None."""
    best = None
    for i in picks:
        got = screen_shape(cands[i]["body"])
        if got is None:
            continue
        png, aspect = got
        key = (max(aspect, 1 / aspect), -len(cands[i]["body"]))
        if best is None or key < best[0]:
            best = (key, cands[i], png)
    return (best[1], best[2]) if best else None


# ── 실행 ──────────────────────────────────────────────────────────────────────

def main() -> None:
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    only = set(args[args.index("--codes") + 1].split(",")) if "--codes" in args else None
    client = get_llm_client(ANTHROPIC_API_KEY)
    if not isinstance(client, SubscriptionClient):
        print("[자동 로고] 구독 경로(CLAUDE_CODE_OAUTH_TOKEN · claude CLI)가 없어 건너뜁니다 — API 판정은 쓰지 않습니다.")
        return

    # --codes 면 화면 목록과 상관없이 그 종목만 본다(손으로 '이 종목 채워 봐').
    codes, n_pages = (set(only), 0) if only else visible_codes()
    db = get_client()
    rows = {r["code"]: r for r in load_all(db, TABLE, "code,market,source,domain,note", order_by="code")}
    names = {s["code"]: s.get("name") or s["code"] for s in load_all(db, "stocks", "code,name", order_by="code")}
    now = datetime.now(timezone.utc)
    targets = pick_targets(codes, rows, now, only)
    print(f"[자동 로고] 화면 {n_pages}개 · 국장 종목 {len(codes)} · 채울 종목 {len(targets)}(상한 {MAX_TARGETS})")
    if not targets:
        return

    with ThreadPoolExecutor(WORKERS) as ex:
        found = dict(zip(targets, ex.map(lambda c: gather(c, rows[c].get("domain")), targets)))

    filled: list[dict] = []
    missed: list[tuple[str, str]] = []
    today = now.astimezone(timezone(timedelta(hours=9))).date().isoformat()
    for c in targets:  # 판정은 하나씩 — 구독 경로 폴백을 호출마다 가르려고
        g = found[c]
        name = names.get(c, c)
        if g.get("miss"):
            missed.append((c, g["miss"]))
            continue
        try:
            verdict = judge(client, name, c, g)
        except Exception as e:  # noqa: BLE001 — 한 종목 판정이 깨져도 나머지는 간다
            verdict = None
            print(f"[자동 로고] {c} {name} 판정 오류: {type(e).__name__}")
        if verdict is None:
            missed.append((c, "판정 못 받음(구독 경로)"))
            continue
        if not verdict["site_is_company"]:
            missed.append((c, f"다른 회사 사이트로 보임 · {verdict['why'][:60]}"))
            continue
        pick = choose(g["cands"], verdict["picks"])
        if pick is None:
            missed.append((c, "회사 로고 후보 없음" if not verdict["picks"] else "칸에서 못 읽힘(긴 글자 · 흰 로고)"))
            continue
        cand, png = pick
        filled.append({
            "code": c, "market": rows[c]["market"], "source": "own", "domain": rows[c].get("domain"),
            "digest": hashlib.sha256(png).hexdigest(), "note": AUTO_OWN_NOTE, "crop": [],
            "image": base64.b64encode(png).decode("ascii"), "image_src": cand["url"], "checked_at": now.isoformat(),
        })
        print(f"[자동 로고] {c} {name} ← {cand['url']} ({verdict['why'][:80]})")

    for c, why in missed:
        print(f"[자동 로고] {c} {names.get(c, c)} 못 채움: {why}")
    print(f"[자동 로고] 채움 {len(filled)} · 못 채움 {len(missed)}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"### 자동 로고 — 채움 {len(filled)} · 못 채움 {len(missed)}\n\n| 종목 | 결과 |\n|---|---|\n")
            for r in filled:
                f.write(f"| {r['code']} {names.get(r['code'], '')} | 채움 · {r['image_src']} |\n")
            for c, why in missed:
                f.write(f"| {c} {names.get(c, '')} | {why} |\n")

    if dry_run:
        print("[자동 로고] --dry-run — 판정표에 적지 않습니다.")
        return
    if filled:
        execute_with_retry(db.table(TABLE).upsert(filled, on_conflict="code"))
    for c, why in missed:
        execute_with_retry(db.table(TABLE).update({"note": f"{AUTO_MISS_PREFIX}{why} ({today})"}).eq("code", c))


if __name__ == "__main__":
    main()
