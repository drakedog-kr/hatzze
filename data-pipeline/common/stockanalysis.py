"""stockanalysis.com 배당 내역 페이지 — 미국 주식·ETF 의 **지급일이 있는** 배당 기록.

    https://stockanalysis.com/stocks/{티커}/dividend/     주식
    https://stockanalysis.com/etf/{티커}/dividend/        ETF

API 가 아니라 **웹페이지**다(fetch_us_analyst.py 와 같은 원천, 같은 약관). 표 하나가 서버에서
그려져 오고 열이 넷이다 — Ex-Dividend Date · Cash Amount · Record Date · Pay Date. 아직 안 준
(선언만 된) 건도 맨 위에 실린다.

## 왜 이걸 쓰나

SEC XBRL 은 금액과 기간만 있고 **지급일이 없다.** 8-K 본문에서 "payable on …"을 긁어 봤더니 마흔
종목 중 열 종목만 네 달이 다 나왔고(2026-09-12 실측) 노이즈도 섞였다. ETF 는 SEC 에 아예 태그가
없다. 이 페이지는 둘 다 준다 — 실측으로 SCHD 2026-06-29 0.2525 · JEPI 2026-09-03 0.37142 가
운용사 공시와 같은 값이었다.

## ⚠️ 약관 — 발췌는 되고 전문 재게시는 안 된다 (fetch_us_analyst.py 머리말과 같다)

"you can use snippets of the content as long as you do not modify the content and clearly state
where you got it from." robots.txt 는 /stocks/ 와 /etf/ 를 막지 않는다(2026-09-12 확인).
    ⛔ 숫자를 바꾸지 말 것. 받은 그대로 담는다.
    ⛔ 화면에서 출처 표기를 빼지 말 것.

⚠️ 페이지라 저쪽이 바뀌면 깨진다. 호출부는 **파싱 실패 수를 찍고 문턱을 넘으면 죽는다.**
"""

from __future__ import annotations

import html
import http.client
import re
import time
import urllib.request
from datetime import date

UA = {"User-Agent": "hatzze/1.0 (+https://hatzze.fun; contact: support@hatzze.fun)"}
BASE = {"stock": "https://stockanalysis.com/stocks/{t}/dividend/", "etf": "https://stockanalysis.com/etf/{t}/dividend/"}
TIMEOUT_SEC = 30
# 저쪽 서버를 두드리는 간격. fetch_us_analyst.py 는 1초다. 하루 300쪽이면 5분.
PAUSE_SEC = 1.0
MON = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
_DATE = re.compile(r"([A-Z][a-z]{2}) (\d{1,2}), (\d{4})")


class PageChanged(RuntimeError):
    """페이지는 열렸는데 배당 표를 못 찾았다 — 저쪽 구조가 바뀐 것이다."""


def _date(s: str) -> str | None:
    m = _DATE.match(s.strip())
    if not m:
        return None
    try:
        return date(int(m.group(3)), MON[m.group(1).lower()], int(m.group(2))).isoformat()
    except (KeyError, ValueError):
        return None


def _amount(s: str) -> float | None:
    s = s.replace("$", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def fetch_page(ticker: str, kind: str) -> str | None:
    """HTML. 404(없는 종목)면 None. 그 밖의 실패는 한 번 더 두드린 뒤 None."""
    url = BASE[kind].format(t=ticker.lower().replace(".", "-"))
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=TIMEOUT_SEC) as r:
                return r.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == 2:
                return None
            time.sleep(3)
        except (OSError, http.client.HTTPException):
            if attempt == 2:
                return None
            time.sleep(3)
    return None


def parse_dividends(page: str) -> list[dict]:
    """[{ex, record, pay, amount}] 최신이 앞. 표가 없으면 PageChanged.

    배당을 안 주는 종목은 페이지는 있지만 표가 없다 — 그건 PageChanged 가 아니라 빈 목록이어야
    하므로, "no dividend" 류 문구가 있으면 빈 목록을 준다.
    """
    for tb in re.findall(r"<table.*?</table>", page, flags=re.S):
        heads = [html.unescape(re.sub(r"<[^>]+>", "", h)).strip() for h in re.findall(r"<th[^>]*>(.*?)</th>", tb, flags=re.S)]
        if not any("Pay" in h for h in heads):
            continue
        out: list[dict] = []
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tb, flags=re.S):
            cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, flags=re.S)]
            if len(cells) < 4:
                continue
            row = dict(zip(heads, cells))
            pay = _date(row.get("Pay Date", ""))
            amt = _amount(row.get("Cash Amount", ""))
            if pay is None or amt is None:
                continue
            out.append({"ex": _date(row.get("Ex-Dividend Date", "")), "record": _date(row.get("Record Date", "")), "pay": pay, "amount": amt})
        return out
    text = re.sub(r"<[^>]+>", " ", page)
    if re.search(r"does not (currently )?pay|no dividend|hasn't paid|has not paid", text, flags=re.I):
        return []
    raise PageChanged("배당 표를 못 찾았다")


def dividend_history(ticker: str, kind: str = "stock") -> list[dict] | None:
    """페이지를 받아 파싱한다. 페이지가 없으면 None, 배당이 없으면 [], 구조가 바뀌면 PageChanged."""
    page = fetch_page(ticker, kind)
    time.sleep(PAUSE_SEC)
    if page is None:
        return None
    return parse_dividends(page)


def trailing(payments: list[dict], today: date, days: int = 365) -> tuple[list[dict], dict | None]:
    """(지난 1년 안에 **지급된** 건, 아직 안 지급된 다음 건). 지급일 기준."""
    since = (today - __import__("datetime").timedelta(days=days)).isoformat()
    paid = sorted((p for p in payments if since < p["pay"] <= today.isoformat()), key=lambda p: p["pay"])
    upcoming = sorted((p for p in payments if p["pay"] > today.isoformat()), key=lambda p: p["pay"])
    return paid, (upcoming[0] if upcoming else None)
