"""KRX KIND(kind.krx.co.kr) 목록 페이지 — 서버가 표를 그려서 주는 POST 한 번짜리 조회들의 공통 조각.

쓰는 곳: fetch_kr_high_dividend.py(고배당기업 현황) · fetch_kr_dividend_payout.py(배당정보) · refresh_stock_logo_sources.py
(상장회사 목록, GET) · fetch_kr_dividend_notices.py(배당 결정 공시 · 뷰어 · 본문) · fetch_market_actions.py(시장 조치).
KIND 요청은 전부 `request` 한 곳을 지난다(서울 경유 · 재시도 — 아래). 앞의 둘은 같은 꼴이다 —
검색 폼을 POST 하면 `<tr>` 들이 오고, `currentPageSize=3000` 이면 한 번에 다 온다(2026-09-13 실측 635 · 2,733).

⚠️ 회사명이 **법인명**이다(케이티·삼성화재해상보험·롯데칠성음료). 종목명과 다른 곳이 스무 곳쯤 있어
   종목명(`stocks`) → 예탁결제원 발행사명(`kr_dividend.issuer_name`) → 손으로 적은 별칭 순으로 코드를 찾는다.
⚠️ KIND 는 거래소 사이트다. KRX Open API 와 같은 상자(비상업)로 본다.
⚠️ 페이지라 저쪽이 바뀌면 깨진다. 호출부는 행 수 하한을 두고 그 아래면 저장하지 않는다.
"""

from __future__ import annotations

import html
import http.client
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from common.retry import backoff_delay

UA = "hatzze/1.0 (+https://hatzze.fun; contact: support@hatzze.fun)"
# 법인명이 종목명·발행사명 어느 쪽과도 안 맞는 곳. 이름이 바뀐 회사다(2026-09-13).
ALIASES = {"유진증권": "001200", "유나이티드": "033270"}


# 해외 러너에서 KRX 호스트는 403 을 일시 차단에 쓴다(2026-08-28 아홉 스크립트가 한꺼번에 맞았다).
# common/krx_client.krx_get 과 같은 그물 — 여섯 번, 2·4·8·16·20·20초 지수 백오프.
MAX_RETRIES = 6
RETRY_BASE_SEC = 2
RETRY_MAX_SEC = 20
TIMEOUT_SEC = 90
# 다시 걸어 볼 상태. 403 은 KIND 가 일시 차단에 쓴다. 나머지 4xx 는 다시 걸어도 같다.
RETRY_STATUSES = frozenset({403, 429})

KIND_ORIGIN = "https://kind.krx.co.kr"
# ── 서울 경유(2026-11-22) ────────────────────────────────────────────────────────────────────
# 러너 IP 차단은 재시도로 못 넘는다 — 같은 러너라서다. 잡(러너)마다 갈리고 하루 반 이어진 적도 있다
# (#815 · #819 · #820 · #823 · #831 · #832). 그래서 KIND_PROXY_URL(사이트의 /api/kind · 서울 icn1)이 있으면 그 길로 먼저
# 묻고, 그 길이 안 되면 같은 시도 안에서 KIND 를 직접 묻는다. 둘 다 없는 곳(로컬 · 국내 IP)은 예전처럼 직접만 묻는다.
#   KIND_PROXY_URL     https://hatzze.fun/api/kind
#   KIND_PROXY_SECRET  사이트의 KIND_PROXY_SECRET(없으면 REVALIDATE_SECRET)와 같은 값 — 워크플로가 REVALIDATE_SECRET 을 넣는다
# 경유 응답에는 X-Kind-Upstream 머리가 붙는다(app/api/kind). 머리가 있으면 상태 코드가 KIND 의 것이고, 없으면 경유 자체의
# 실패다(비밀 · 허락 밖 경로 · 배포 문제) — 비밀이 틀린 401 · 허락 밖 400 · 비밀 없는 503 은 이 프로세스에서 다시 묻지 않는다.
UPSTREAM_HEADER = "X-Kind-Upstream"
_relay_off = False
_relay_announced = False


def _relay() -> tuple[str, str] | None:
    base = os.environ.get("KIND_PROXY_URL", "").strip().rstrip("/")
    secret = os.environ.get("KIND_PROXY_SECRET", "").strip()
    return (base, secret) if base and secret and not _relay_off else None


def request(
    url: str,
    *,
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = TIMEOUT_SEC,
    max_retries: int = MAX_RETRIES,
) -> bytes | None:
    """KIND 에 한 번 묻는다 → 본문 바이트. 서울 경유가 있으면 그 길이 먼저다(위 주석).

    시도마다 경유 → 직접 순으로 묻고, 둘 다 403 · 429 · 5xx · 연결 실패면 기다렸다 다시 한다(max_retries 번).
    그 밖의 4xx 는 다시 걸어도 같으니 바로 None. 다 실패해도 None.
    """
    global _relay_off, _relay_announced
    name = url.split("?", 1)[0].rsplit("/", 1)[-1]
    hdrs = {"User-Agent": UA, **(headers or {})}
    for attempt in range(1, max_retries + 1):
        reasons = []
        relay = _relay() if url.startswith(KIND_ORIGIN + "/") else None
        if relay:
            base, secret = relay
            via = base + url[len(KIND_ORIGIN):]
            try:
                body = _open(via, data, {**hdrs, "Authorization": f"Bearer {secret}"}, timeout)
                if not _relay_announced:
                    print(f"[KIND] 서울 경유로 받습니다({base})")
                    _relay_announced = True
                return body
            except urllib.error.HTTPError as exc:
                if exc.headers is None or exc.headers.get(UPSTREAM_HEADER) is None:
                    reasons.append(f"경유 실패 {exc.code}")
                    if exc.code in (400, 401, 503):
                        print(f"[KIND] {name} 서울 경유가 {exc.code} 를 줘 이 실행에서는 직접 묻습니다")
                        _relay_off = True
                elif exc.code not in RETRY_STATUSES and exc.code < 500:
                    print(f"[KIND] {name} HTTP {exc.code}(서울 경유) — 재시도하지 않습니다")
                    return None
                else:
                    reasons.append("서울 경유도 일시 차단 403" if exc.code == 403 else f"서울 경유 {exc.code}")
            except (OSError, http.client.HTTPException) as exc:
                reasons.append(f"경유 요청 실패 {exc}")
        try:
            return _open(url, data, hdrs, timeout)
        except urllib.error.HTTPError as exc:
            if exc.code not in RETRY_STATUSES and exc.code < 500:
                print(f"[KIND] {name} HTTP {exc.code} — 재시도하지 않습니다")
                return None
            reasons.append("일시 차단 403" if exc.code == 403 else f"서버 오류 {exc.code}" if exc.code >= 500 else f"HTTP {exc.code}")
        except (OSError, http.client.HTTPException) as exc:
            reasons.append(f"요청 실패 {exc}")
        print(f"[KIND] {name} {' · '.join(reasons)} ({attempt}/{max_retries})")
        if attempt < max_retries:
            time.sleep(backoff_delay(attempt, RETRY_BASE_SEC, RETRY_MAX_SEC))
    print(f"[KIND] {name} 요청이 {max_retries}번 모두 실패했습니다")
    return None


def _open(url: str, data: bytes | None, headers: dict[str, str], timeout: float) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=timeout) as r:
        return r.read()


def post_list(url: str, referer: str, data: dict) -> str | None:
    """검색 폼을 POST 해 표 HTML 을 받는다. 재시도 · 실패는 request 와 같다(다 실패하면 None)."""
    body = request(
        url,
        data=urllib.parse.urlencode(data).encode(),
        headers={"Referer": referer, "X-Requested-With": "XMLHttpRequest"},
    )
    return None if body is None else body.decode("utf-8", "ignore")


def get_page(url: str, encoding: str = "utf-8") -> str | None:
    """폼 없이 GET 한 번으로 표를 주는 주소(상장회사 목록 내려받기 — refresh_stock_logo_sources.py).

    재시도 · 실패는 post_list 와 같다. 상장회사 목록은 EUC-KR 이라 encoding 을 받는다.
    """
    body = request(url)
    return None if body is None else body.decode(encoding, "ignore")


def rows_of(page: str, min_cells: int) -> list[tuple[list[str], str]]:
    """표의 행 — (칸 글자 목록, 행 HTML). 칸이 min_cells 보다 적은 행(머리·빈 행)은 뺀다."""
    out: list[tuple[list[str], str]] = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.S):
        cells = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", c))).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, flags=re.S)]
        if len(cells) >= min_cells:
            out.append((cells, tr))
    return out


def num(s: str) -> float | None:
    """'52.133 *' → 52.133, '-' → None."""
    m = re.match(r"-?[\d,]*\.?\d+", s.replace(",", "").strip())
    return float(m.group(0)) if m else None


def norm(s: str) -> str:
    return re.sub(r"\s+", "", s).lower()


def code_lookup(db, today_year: int) -> dict[str, tuple[str, str]]:
    """법인명·종목명(정규화) → (코드, 종목명). 종목명이 먼저, 발행사명은 비어 있는 자리만 채운다."""
    from common.supabase_client import load_all_keyset

    stocks = load_all_keyset(db, "stocks", "code,name", key="code")
    by_name: dict[str, tuple[str, str]] = {}
    for s in stocks:
        by_name.setdefault(norm(s["name"]), (s["code"], s["name"]))
    name_of = {s["code"]: s["name"] for s in stocks}
    # 예탁결제원 발행사명(보통주 행). 2년치면 상장사는 다 있다. 1,000행 캡이라 (isin, record_date) 순으로 쪽을 넘긴다.
    since = f"{today_year - 2}-01-01"
    for frm in range(0, 100_000, 1000):
        chunk = db.table("kr_dividend").select("code,issuer_name,share_kind").gte("record_date", since).order("isin").order("record_date").range(frm, frm + 999).execute().data
        for r in chunk:
            if r.get("share_kind") in (None, "보통주") and r.get("issuer_name") and r["code"] in name_of:
                by_name.setdefault(norm(r["issuer_name"]), (r["code"], name_of[r["code"]]))
        if len(chunk) < 1000:
            break
    for corp, code in ALIASES.items():
        if code in name_of:
            by_name.setdefault(norm(corp), (code, name_of[code]))
    return by_name
