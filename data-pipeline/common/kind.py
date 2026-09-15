"""KRX KIND(kind.krx.co.kr) 목록 페이지 — 서버가 표를 그려서 주는 POST 한 번짜리 조회들의 공통 조각.

쓰는 곳: fetch_kr_high_dividend.py(고배당기업 현황) · fetch_kr_dividend_payout.py(배당정보). 둘 다 같은 꼴이다 —
검색 폼을 POST 하면 `<tr>` 들이 오고, `currentPageSize=3000` 이면 한 번에 다 온다(2026-09-13 실측 635 · 2,733).

⚠️ 회사명이 **법인명**이다(케이티·삼성화재해상보험·롯데칠성음료). 종목명과 다른 곳이 스무 곳쯤 있어
   종목명(`stocks`) → 예탁결제원 발행사명(`kr_dividend.issuer_name`) → 손으로 적은 별칭 순으로 코드를 찾는다.
⚠️ KIND 는 거래소 사이트다. KRX Open API 와 같은 상자(비상업)로 본다.
⚠️ 페이지라 저쪽이 바뀌면 깨진다. 호출부는 행 수 하한을 두고 그 아래면 저장하지 않는다.
"""

from __future__ import annotations

import html
import http.client
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


def post_list(url: str, referer: str, data: dict) -> str | None:
    """검색 폼을 POST 해 표 HTML 을 받는다.

    연결 실패·5xx·403 은 MAX_RETRIES 번 재시도하고 그래도 안 되면 None. 그 밖의 4xx 는 다시 걸어도
    같으니 바로 None.
    """
    body = urllib.parse.urlencode(data).encode()
    headers = {"User-Agent": UA, "Referer": referer, "X-Requested-With": "XMLHttpRequest"}
    name = url.rsplit("/", 1)[-1]
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=90) as r:
                return r.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as exc:
            if exc.code < 500 and exc.code != 403:
                print(f"[KIND] {name} HTTP {exc.code} — 재시도하지 않습니다")
                return None
            reason = "일시 차단 403" if exc.code == 403 else f"서버 오류 {exc.code}"
        except (OSError, http.client.HTTPException) as exc:
            reason = f"요청 실패 {exc}"
        print(f"[KIND] {name} {reason} ({attempt}/{MAX_RETRIES})")
        if attempt < MAX_RETRIES:
            time.sleep(backoff_delay(attempt, RETRY_BASE_SEC, RETRY_MAX_SEC))
    print(f"[KIND] {name} 요청이 {MAX_RETRIES}번 모두 실패했습니다")
    return None


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
