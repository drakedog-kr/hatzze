"""예스24 주간 종합 베스트셀러 상위 100권 중 경제경영 도서 비중을 계산해 Supabase에 upsert.

## 원천이 알라딘에서 예스24 로 바뀌었다 (2026-11-02, 이슈 #798)

알라딘 OpenAPI 가 2026-10-30 에 서비스를 끝냈다(신규 키 발급은 09-04 종료). 응답이
`www.aladin.co.kr 도메인을 통한 OpenAPI서비스는 종료되었습니다.(code=999)` 로 바뀌었고 대체 주소는 없다.
알라딘 웹 화면은 robots.txt 가 일반 봇을 전부 막고(`User-agent: *` → `Disallow: /`), 교보문고는 목록을
내주는 `/api/gw` 를 막는다. 예스24 는 베스트셀러 화면을 열어 두었고 이용약관(57개 조)에 자동 수집을 막는
조항이 없다. 한 주에 두 쪽만 받는다.

## 무엇을 세나

알라딘 때와 같은 물음이다 — "이번 주 많이 팔린 책 100권 중 경제경영 책이 몇 권인가". 예스24 는 책마다
분류를 목록에 안 적으므로, 같은 주의 **경제경영 분야 주간 베스트 120권**과 맞대어 센다. 분야 순위는 종합
순위에서 그 분야 책만 남긴 것이라, 종합 100위 안의 경제경영 책은 반드시 분야 100위 안에 있다.

## 주 단위다

예스24 주간 베스트는 월~일 한 주 판매로 매긴다. 실행마다 **끝난 지난주**를 받아 오늘(KST) 행에 쓴다 —
그래서 한 주 내내 같은 값이 이어진다(알라딘도 주 단위로 갱신돼 그랬다). 행의 details.source_date 는 그 주의
일요일이라 check_freshness 가 자료 날짜로 늦음을 잰다. 월요일 아침에 지난주 목록이 아직 안 열렸으면 그 앞 주를 쓴다.

⭐ 알라딘과 달리 **지난 주를 다시 받을 수 있다**(주차 번호가 2008년 3월부터 이어진다). 빈 날이 생기면
`--since` 로 메운다:

    python scripts/fetch_bestseller_ratio.py                          # 오늘 행
    python scripts/fetch_bestseller_ratio.py --since 2026-07-09       # 그날부터 오늘까지 날마다
    python scripts/fetch_bestseller_ratio.py --since 2026-07-09 --dry-run

⚠️ 알라딘 값과 수준이 다르다. 같은 17주(2026-07~10)를 맞대면 예스24 평균 9.1% · 알라딘 주평균 5.7% 이고 상관이
0.24 라, 같은 눈금으로 이어 쓸 수 없다. 기준선은 예스24 주간 전 기간으로 다시 잡았다(config/indicator_thresholds.py).
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.retry import backoff_delay  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.indicator import ensure_indicator  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

WEEK_URL = "https://www.yes24.com/product/category/weekbestseller"
ALL_CATEGORY = "001"           # 국내도서 종합
ECONOMY_CATEGORY = "001001025"  # 국내도서 > 경제 경영
PAGE_SIZE = 120                # 화면이 고르게 해 주는 가장 큰 값. 종합은 앞 100권만 쓴다.
TOP_N = 100
# 주차 번호는 한 주에 하나씩 오른다. 1192 = 2026-10-26(월) ~ 11-01(일) 이다(화면의 주 고르기 목록에서 확인).
ANCHOR_WEEK, ANCHOR_MONDAY = 1192, date(2026, 10, 26)
REQUEST_TIMEOUT_SEC = 30
MAX_RETRIES = 3
RETRY_DELAY_SEC = 3
RETRY_MAX_DELAY_SEC = 20
PAUSE_SEC = 1.0                # --since 로 여러 주를 받을 때 쪽 사이 쉬는 시간
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; hatzze-bestseller/1.0; +https://hatzze.fun)"}
GOODS_RE = re.compile(r'data-goods-no="(\d+)"')

INDICATOR_SLUG = "bestseller_finance_ratio"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "경제 베스트셀러 비중",
    "headline": "베스트셀러 100권 중 경제 책 비중",
    "category": "감성",
    "description_beginner": "재테크 책이 많으면 관심이 쏠렸다는 신호입니다",
    "unit": "%",
}


def week_monday(week_no: int) -> date:
    return ANCHOR_MONDAY + timedelta(weeks=week_no - ANCHOR_WEEK)


def last_finished_week(day: date) -> int:
    """day 보다 앞서 끝난 가장 최근 주(월~일)의 주차 번호. 월요일이면 어제 끝난 주다."""
    last_sunday = day - timedelta(days=day.weekday() + 1)
    return ANCHOR_WEEK + (last_sunday - timedelta(days=6) - ANCHOR_MONDAY).days // 7


def parse_goods(html: str) -> list[str]:
    """목록 순서대로 상품 번호. 한 상품이 여러 번 찍혀도 처음 자리만 남긴다."""
    return list(dict.fromkeys(GOODS_RE.findall(html)))


def check_week_label(html: str, week_no: int) -> None:
    """화면의 주 고르기 목록에 그 주가 있으면 날짜가 셈과 맞는지 본다 — 주차 번호를 다시 매기면 여기서 멈춘다.

    목록은 올해 주만 싣는다. 지난해 주는 확인할 칸이 없어 넘어간다.
    """
    m = re.search(r'<option[^>]*value="%d"[^>]*>\s*(\d{2})월 (\d{2})일' % week_no, html)
    if not m:
        return
    mon = week_monday(week_no)
    if (int(m.group(1)), int(m.group(2))) != (mon.month, mon.day):
        raise RuntimeError(f"예스24 주차 {week_no} 가 {m.group(1)}월 {m.group(2)}일 시작인데 셈은 {mon} 이다 — ANCHOR 를 다시 잴 것")


def fetch_list(category: str, week_no: int) -> tuple[list[str], str]:
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(
                WEEK_URL,
                params={"categoryNumber": category, "pageNumber": 1, "pageSize": PAGE_SIZE, "weekNo": week_no},
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT_SEC,
            )
            resp.raise_for_status()
            return parse_goods(resp.text), resp.text
        except requests.exceptions.RequestException as e:
            last_error = e
            print(f"[YES24] {category} 주차 {week_no} 요청 실패 ({attempt}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES:
                time.sleep(backoff_delay(attempt, RETRY_DELAY_SEC, RETRY_MAX_DELAY_SEC))
    raise RuntimeError(f"예스24 {category} 주차 {week_no} 요청이 {MAX_RETRIES}번 모두 실패했습니다") from last_error


def economy_share(all_goods: list[str], economy_goods: list[str]) -> tuple[float, int]:
    """종합 앞 100권 중 경제경영 분야 목록에 든 권수와 비중(%)."""
    top = all_goods[:TOP_N]
    if len(top) < TOP_N:
        raise RuntimeError(f"예스24 종합 목록이 {len(top)}권뿐입니다(100권이 필요)")
    eco = set(economy_goods)
    count = sum(g in eco for g in top)
    return round(count / TOP_N * 100, 2), count


def fetch_week(week_no: int) -> tuple[float, int] | None:
    """그 주의 비중. 아직 안 열린 주(종합 목록이 비었다)면 None."""
    all_goods, html = fetch_list(ALL_CATEGORY, week_no)
    if not all_goods:
        return None
    check_week_label(html, week_no)
    time.sleep(PAUSE_SEC)
    economy_goods, _ = fetch_list(ECONOMY_CATEGORY, week_no)
    if not economy_goods:
        raise RuntimeError(f"예스24 경제경영 주차 {week_no} 목록이 비었습니다")
    return economy_share(all_goods, economy_goods)


def latest_week(day: date) -> tuple[int, float, int]:
    """day 에 쓸 주 — 지난주가 아직 안 열렸으면 그 앞 주."""
    week_no = last_finished_week(day)
    for wk in (week_no, week_no - 1):
        got = fetch_week(wk)
        if got is not None:
            return (wk, *got)
        print(f"[YES24] 주차 {wk}({week_monday(wk)} 주) 목록이 아직 없어 앞 주를 봅니다")
        time.sleep(PAUSE_SEC)
    raise RuntimeError(f"예스24 주간 베스트를 받지 못했습니다(주차 {week_no}, {week_no - 1})")


def row_for(indicator_id: str, day: date, week_no: int, ratio: float) -> dict:
    sunday = week_monday(week_no) + timedelta(days=6)
    return {
        "indicator_id": indicator_id,
        "date": day.isoformat(),
        "raw_value": ratio,
        # 자료 날짜는 그 주의 일요일이다(check_freshness 가 행 날짜 대신 이걸 본다).
        "details": {"source": "yes24_week", "week_no": week_no, "source_date": int(sunday.strftime("%Y%m%d"))},
    }


def main(since: str | None = None, dry_run: bool = False) -> None:
    today = today_kst()

    if not since:
        week_no, ratio, count = latest_week(today)
        print(f"[YES24] 주차 {week_no}({week_monday(week_no)} 주) 종합 100권 중 경제경영 {count}권 → {ratio}%")
        if dry_run:
            return
        client = get_client()
        indicator_id = ensure_indicator(client, INDICATOR_META)
        # 행 날짜는 KST 다. 러너가 UTC 라 date.today() 를 쓰면 09:00 KST 전에 도는 아침 실행이 전날 행을 덮어썼다(2026-10-16 전수 검사 4).
        client.table("indicator_values").upsert(row_for(indicator_id, today, week_no, ratio), on_conflict="indicator_id,date").execute()
        print(f"[Supabase] indicator_values upsert 완료: date={today}, raw_value={ratio}")
        return

    start = date.fromisoformat(since)
    days = [start + timedelta(days=i) for i in range((today - start).days + 1)]
    weeks: dict[int, tuple[float, int]] = {}
    rows = []
    client = None if dry_run else get_client()
    indicator_id = "dry-run" if dry_run else ensure_indicator(client, INDICATOR_META)
    for day in days:
        # 오늘은 실시간과 같은 규칙(안 열렸으면 앞 주), 지난날은 그날 기준 지난주가 이미 열려 있다.
        if day == today and last_finished_week(day) not in weeks:
            week_no, ratio, count = latest_week(day)
            weeks.setdefault(week_no, (ratio, count))
        else:
            week_no = last_finished_week(day)
            if week_no not in weeks:
                got = fetch_week(week_no)
                if got is None:
                    raise RuntimeError(f"예스24 주차 {week_no} 목록이 비었습니다({day} 행)")
                weeks[week_no] = got
                time.sleep(PAUSE_SEC)
        rows.append(row_for(indicator_id, day, week_no, weeks[week_no][0]))
    for wk in sorted(weeks):
        print(f"[YES24] 주차 {wk}({week_monday(wk)} 주) 경제경영 {weeks[wk][1]}권 → {weeks[wk][0]}%")
    print(f"[YES24] {days[0]} ~ {days[-1]} {len(rows)}행 · {len(weeks)}주")
    if dry_run:
        return
    client.table("indicator_values").upsert(rows, on_conflict="indicator_id,date").execute()
    print(f"[Supabase] indicator_values {len(rows)}행 upsert 완료")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="이 날(YYYY-MM-DD)부터 오늘까지 날마다 그날 쓸 주의 값을 다시 쓴다")
    ap.add_argument("--dry-run", action="store_true", help="값만 찍고 DB 에 쓰지 않는다")
    args = ap.parse_args()
    main(args.since, args.dry_run)
