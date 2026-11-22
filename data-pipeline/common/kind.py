"""KRX KIND(kind.krx.co.kr) 목록 페이지 — 서버가 표를 그려서 주는 POST 한 번짜리 조회들의 공통 조각.

쓰는 곳: fetch_kr_high_dividend.py(고배당기업 현황) · fetch_kr_dividend_payout.py(배당정보) · refresh_stock_logo_sources.py
(상장회사 목록, GET) · fetch_kr_dividend_notices.py(배당 결정 공시 · 뷰어 · 본문) · fetch_market_actions.py(시장 조치).
KIND 요청은 전부 `request` 한 곳을 지난다(재시도 · 막혀서 못 받은 날 — 아래). 앞의 둘은 같은 꼴이다 —
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
from collections.abc import Callable
from datetime import date

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

# ── 막혀서 못 받은 날(2026-11-22) ────────────────────────────────────────────────────────────
# KIND 앞의 Akamai 가 클라우드(데이터센터) IP 를 막는다. 깃헙 러너는 받은 IP 에 따라 막히다 말다 하고(11-01~22 실행 44회 중
# 10회에서 다 실패 · 같은 러너라 재시도로는 못 넘는다), 서울 Vercel 함수도 늘 막혔다(#833 을 머지해 재 봄 · 일곱 번 다 403).
# 국내 가정 회선은 늘 받는다. 이 표들은 매 실행 전량을 다시 받거나(고배당 · 배당성향) 열흘 창을 다시 받으므로(배당 공시)
# 하루 이틀 막혀도 잃는 것이 없다. 그래서 '막혀서 못 받음'만 가려(blocked), 마지막으로 받은 날이 STALE_AFTER_DAYS 안이면
# 경고만 남기고 스텝을 성공으로 끝낸다(skip_blocked). 더 오래 못 받았거나 막힌 게 아닌 실패(페이지가 바뀜 등)는 예전처럼
# 실패로 끝나 알림이 열린다. 이슈 #815 · #819 · #820 · #823 · #831 · #832 가 전부 '하루 막힘'이었고 잃은 자료는 없었다.
# ⛔ 막힌 IP 를 피해 가는 길(가정용 프록시 · IP 돌리기)은 쓰지 않는다 — 봇 차단 회피다.
STALE_AFTER_DAYS = 2
_last_failure: str | None = None  # 마지막 request 가 None 을 준 까닭: "blocked"(403 · 429 · 5xx · 연결 실패만) · "http"(그 밖의 4xx)


def request(
    url: str,
    *,
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = TIMEOUT_SEC,
    max_retries: int = MAX_RETRIES,
) -> bytes | None:
    """KIND 에 묻는다 → 본문 바이트.

    403 · 429 · 5xx · 연결 실패는 기다렸다 다시 한다(max_retries 번). 그 밖의 4xx 는 다시 걸어도 같으니 바로 None.
    다 실패해도 None — 그때 blocked() 가 참이다.
    """
    global _last_failure
    _last_failure = None
    name = url.split("?", 1)[0].rsplit("/", 1)[-1]
    hdrs = {"User-Agent": UA, **(headers or {})}
    for attempt in range(1, max_retries + 1):
        try:
            return _open(url, data, hdrs, timeout)
        except urllib.error.HTTPError as exc:
            if exc.code not in RETRY_STATUSES and exc.code < 500:
                print(f"[KIND] {name} HTTP {exc.code} — 재시도하지 않습니다")
                _last_failure = "http"
                return None
            reason = "일시 차단 403" if exc.code == 403 else f"서버 오류 {exc.code}" if exc.code >= 500 else f"HTTP {exc.code}"
        except (OSError, http.client.HTTPException) as exc:
            reason = f"요청 실패 {exc}"
        print(f"[KIND] {name} {reason} ({attempt}/{max_retries})")
        if attempt < max_retries:
            time.sleep(backoff_delay(attempt, RETRY_BASE_SEC, RETRY_MAX_SEC))
    print(f"[KIND] {name} 요청이 {max_retries}번 모두 실패했습니다")
    _last_failure = "blocked"
    return None


def blocked() -> bool:
    """마지막 request 가 막혀서(403 · 429 · 5xx · 연결 실패만 되풀이) None 을 줬는가."""
    return _last_failure == "blocked"


def skip_blocked(label: str, today: date, last_ok: Callable[[], date | None]) -> bool:
    """KIND 가 막혀 못 받았을 때 이번 실행을 건너뛰어도 되나(위 주석).

    막힌 게 맞고 마지막으로 받은 날이 STALE_AFTER_DAYS 안이면 경고를 남기고 참 — 호출부는 저장 없이 정상 종료한다.
    막힌 게 아니거나(페이지 · 요청이 틀림), 마지막 날을 모르거나, 더 낡았으면 거짓 — 호출부는 예전처럼 실패로 끝낸다.
    last_ok 는 막혔을 때만 부른다(마지막 날을 DB 에서 읽는다 — 막힌 게 아니면 읽을 까닭이 없다).
    """
    if not blocked():
        return False
    last_ok = last_ok()
    if last_ok is None:
        print(f"[KIND] {label}: 막혀서 못 받았고 마지막으로 받은 날을 모릅니다 — 실패로 끝냅니다")
        return False
    days = (today - last_ok).days
    if days > STALE_AFTER_DAYS:
        print(f"[KIND] {label}: 막혀서 못 받았고 마지막으로 받은 날이 {last_ok}({days}일 전)입니다 — 실패로 끝냅니다")
        return False
    msg = f"{label}: KIND 가 이 러너를 막아 이번엔 건너뜁니다. 마지막으로 받은 날 {last_ok}({days}일 전) · 다음 실행이 다시 받습니다"
    print(f"[KIND] {msg}")
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::warning title=KIND 일시 차단::{msg}")
    return True


def latest_computed_for(db, *tables: str) -> date | None:
    """그 표들이 마지막으로 다시 받아진 날(computed_for 의 최댓값 · KST). 고배당 · 배당성향은 매 실행 전량을 이 날짜로 다시 쓴다."""
    best: date | None = None
    for table in tables:
        try:
            r = db.table(table).select("computed_for").order("computed_for", desc=True).limit(1).execute().data
        except Exception as exc:  # noqa: BLE001 — 날짜를 못 읽으면 모르는 것으로 둔다(호출부가 실패로 끝낸다)
            print(f"[KIND] {table} 마지막 날짜를 못 읽었습니다: {type(exc).__name__}")
            continue
        if r and r[0].get("computed_for"):
            d = date.fromisoformat(str(r[0]["computed_for"])[:10])
            best = d if best is None or d > best else best
    return best


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
