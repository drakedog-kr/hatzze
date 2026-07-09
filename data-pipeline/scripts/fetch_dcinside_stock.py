"""디시인사이드 주식 갤러리(neostock)의 오늘자 게시글 수를 세어 Supabase에 upsert.

robots.txt 확인 결과 gall.dcinside.com은 `User-agent: * / Allow: /`이고, 갤러리
단위로 명시 차단된 id 목록(stock_new, stock_new2 등)은 모두 2013~2015년에
운영되던 과거 아카이브 갤러리다. 현재 실제 운영 중인 주식 갤러리(2020년 개설, id=neostock)는
차단 목록에 없어 스크래핑 대상으로 사용한다.
"""

from __future__ import annotations

import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402

GALLERY_ID = "neostock"
LIST_URL = "https://gall.dcinside.com/board/lists/"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}
REQUEST_DELAY_SEC = 1.5
MAX_PAGES = 30  # 무한 순회 방지용 안전장치

BACKFILL_DAYS = 30
DAY_BOUNDARY_DELAY_SEC = 4.0  # 하루치 수집이 끝나고 다음 날짜로 넘어갈 때 추가로 쉬는 시간
MAX_BACKFILL_PAGES = 300  # 무한 순회 방지용 안전장치 (30일치라 페이지 수가 더 많이 필요)

INDICATOR_SLUG = "dcinside_post_count"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "디시인사이드 주식 갤러리 게시글 수",
    "category": "밈",
    "description_beginner": "게시글이 갑자기 폭증하면 다들 주식 얘기만 하고 있다는 뜻 — 관심이 쏠린 정점일 수 있어요",
    "unit": "건",
}


def ensure_indicator(client) -> str:
    existing = (
        client.table("indicators").select("id").eq("slug", INDICATOR_SLUG).execute()
    )
    if existing.data:
        return existing.data[0]["id"]

    inserted = client.table("indicators").insert(INDICATOR_META).execute()
    return inserted.data[0]["id"]


def fetch_page(page: int) -> BeautifulSoup:
    resp = requests.get(
        LIST_URL,
        params={"id": GALLERY_ID, "page": page},
        headers=HEADERS,
        timeout=10,
    )
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def count_today_posts() -> int:
    today_str = date.today().isoformat()
    count = 0
    page = 1

    while page <= MAX_PAGES:
        soup = fetch_page(page)
        rows = soup.select("table.gall_list tbody tr")
        if not rows:
            break

        page_has_today_post = False
        reached_older_post = False

        for row in rows:
            if row.get("data-type") == "icon_notice":
                continue  # 상단 고정 공지

            date_td = row.select_one("td.gall_date")
            title_attr = date_td.get("title") if date_td else None
            if not title_attr:
                continue  # 설문/광고 등 실제 게시글이 아닌 행 (title 속성 없음)

            post_date = title_attr[:10]  # "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DD"
            if post_date == today_str:
                count += 1
                page_has_today_post = True
            else:
                reached_older_post = True

        print(f"[DCInside] {page}페이지 조회 완료 (누적 {count}건)")

        if reached_older_post or not page_has_today_post:
            break

        page += 1
        time.sleep(REQUEST_DELAY_SEC)

    return count


def backfill_daily_counts(client, indicator_id: str) -> None:
    """최근 BACKFILL_DAYS일치 게시글 수를 과거 페이지를 거슬러 올라가며 집계한다.

    이미 저장된 날짜라도 그 날짜의 게시글이 흩어져 있는 페이지 자체는 순서상
    반드시 거쳐가야 하지만(페이지네이션에 날짜 점프 기능이 없음), 이미 저장된
    날짜는 최종 저장 단계에서 제외해 중복 upsert를 하지 않는다.
    """
    today = date.today()
    target_dates = {
        (today - timedelta(days=offset)).isoformat() for offset in range(BACKFILL_DAYS)
    }

    existing = (
        client.table("indicator_values")
        .select("date")
        .eq("indicator_id", indicator_id)
        .in_("date", list(target_dates))
        .execute()
    )
    existing_dates = {row["date"] for row in existing.data}
    missing_dates = target_dates - existing_dates

    if not missing_dates:
        print(f"[DCInside] 백필할 신규 날짜 없음 (최근 {BACKFILL_DAYS}일 모두 저장됨)")
        return

    oldest_missing = min(missing_dates)
    print(f"[DCInside] 백필 대상 {len(missing_dates)}일 (가장 오래된 날짜: {oldest_missing})")

    # 갤러리 목록에는 간혹 "개념글"처럼 원래 날짜의 오래된 글이 최신 글 사이에
    # 끼어 나오는 경우가 있다(정상적인 시간순 정렬을 깨뜨림). 이런 행 하나만
    # 보고 바로 종료하면 실제로는 더 있는 데이터를 놓칠 수 있으므로, 목표 범위보다
    # 오래된 행이 연속으로 여러 개 나올 때만 완전히 지난 것으로 판단한다.
    OLD_ROW_STREAK_THRESHOLD = 5

    day_counts: dict[str, int] = {}
    current_day: str | None = None
    page = 1
    done = False
    consecutive_old_rows = 0

    while page <= MAX_BACKFILL_PAGES and not done:
        soup = fetch_page(page)
        rows = soup.select("table.gall_list tbody tr")
        if not rows:
            break

        for row in rows:
            if row.get("data-type") == "icon_notice":
                continue

            date_td = row.select_one("td.gall_date")
            title_attr = date_td.get("title") if date_td else None
            if not title_attr:
                continue

            post_date = title_attr[:10]

            if post_date < oldest_missing:
                consecutive_old_rows += 1
                if consecutive_old_rows >= OLD_ROW_STREAK_THRESHOLD:
                    done = True
                    break
                continue
            consecutive_old_rows = 0

            if post_date != current_day:
                if current_day is not None:
                    print(f"[DCInside] {current_day} 집계 완료: {day_counts.get(current_day, 0)}건")
                    time.sleep(DAY_BOUNDARY_DELAY_SEC)
                current_day = post_date

            day_counts[post_date] = day_counts.get(post_date, 0) + 1

        print(f"[DCInside] {page}페이지 조회 완료")
        page += 1
        if not done:
            time.sleep(REQUEST_DELAY_SEC)

    if current_day is not None:
        print(f"[DCInside] {current_day} 집계 완료: {day_counts.get(current_day, 0)}건")

    rows_to_save = [
        {"indicator_id": indicator_id, "date": d, "raw_value": c}
        for d, c in day_counts.items()
        if d in missing_dates
    ]
    if rows_to_save:
        client.table("indicator_values").upsert(
            rows_to_save, on_conflict="indicator_id,date"
        ).execute()
    print(f"[DCInside] 백필 완료: {len(rows_to_save)}일치 저장")


def main() -> None:
    client = get_client()
    indicator_id = ensure_indicator(client)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    if "--backfill" in sys.argv:
        backfill_daily_counts(client, indicator_id)
        return

    post_count = count_today_posts()
    today = date.today().isoformat()
    print(f"[DCInside] 오늘({today}) 주식 갤러리 게시글 수: {post_count}건")

    client.table("indicator_values").upsert(
        {"indicator_id": indicator_id, "date": today, "raw_value": post_count},
        on_conflict="indicator_id,date",
    ).execute()
    print(f"[Supabase] indicator_values upsert 완료: date={today}, raw_value={post_count}")


if __name__ == "__main__":
    main()
