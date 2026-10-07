"""어제(KST) 올라온 '주식' 쇼츠 수를 froth 지표로 저장 — '주식 쇼츠'.

'재테크 유튜브 조회수'(fetch_youtube_finance_search.py)가 **보는 쪽**이라면 이건 **만드는 쪽**이다. 주식 얘기가 돈이
되겠다 싶으면 너도나도 쇼츠를 찍어 올린다(2026-10-07 하루 880개).

과열도는 유튜브 조회수와 같은 꼴이다 — 평소(최근 30일 평균, indicator_thresholds 의 window) 대비 몇 % 많은가를
surge_map 으로 편다. 백필 없이 첫날부터 값이 나온다(첫날은 평소 = 오늘).
⚠️ 쉬는 날엔 20%쯤 빠진다(10-05 대체공휴일 722 · 10-06 899 · 10-07 880).

세는 법: YouTube Data API search.list(q='주식' · videoDuration=short · regionCode=KR · order=date)로 KST 하루를 6시간씩
네 구간으로 나눠 다음 쪽이 없을 때까지 넘긴다(한 질의 결과가 500개 남짓에서 잘려서). 하루 20쪽 안팎 = 2,000단위 —
하루 한도 1만(재테크 유튜브 조회수와 같은 키)이라, 하루 두 번 실행 중 이미 센 날은 건너뛴다.

실행:
    cd data-pipeline && source .venv/bin/activate && python scripts/fetch_youtube_shorts.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import YOUTUBE_API_KEY  # noqa: E402
from common.indicator import ensure_indicator  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
KST = timezone(timedelta(hours=9))
MAX_PAGES_PER_WINDOW = 10

INDICATOR_SLUG = "youtube_stock_shorts"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "주식 쇼츠",
    "category": "감성",
    "headline": "하루에 올라온 주식 쇼츠",
    "description_beginner": "주식 쇼츠가 평소보다 쏟아지면 과열 신호입니다",
    "unit": "개",
}


def count_window(start: datetime, end: datetime) -> tuple[int, bool]:
    """[start, end) 에 올라온 쇼츠 수와 '끝까지 넘겼나'."""
    iso = lambda t: t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
    seen: set[str] = set()
    token = None
    for _ in range(MAX_PAGES_PER_WINDOW):
        params = {
            "part": "id,snippet", "q": "주식", "type": "video", "videoDuration": "short", "regionCode": "KR",
            "relevanceLanguage": "ko", "order": "date", "maxResults": 50, "key": YOUTUBE_API_KEY,
            "publishedAfter": iso(start), "publishedBefore": iso(end),
        }
        if token:
            params["pageToken"] = token
        resp = requests.get(SEARCH_URL, params=params, timeout=20)
        resp.raise_for_status()
        body = resp.json()
        for it in body.get("items", []):
            t = datetime.fromisoformat(it["snippet"]["publishedAt"].replace("Z", "+00:00"))
            if start <= t < end:  # 구간 밖 시각이 가끔 섞여 온다(하루 7건 안팎)
                seen.add(it["id"]["videoId"])
        token = body.get("nextPageToken")
        if not token:
            return len(seen), True
    return len(seen), False


def main() -> None:
    if not YOUTUBE_API_KEY:
        print("[주식 쇼츠] YOUTUBE_API_KEY 없음 — 건너뜁니다")
        return
    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)

    day = today_kst() - timedelta(days=1)
    have = client.table("indicator_values").select("date").eq("indicator_id", indicator_id).eq("date", day.isoformat()).execute()
    if have.data:
        print(f"[주식 쇼츠] {day} 은 이미 셌습니다 — 한도를 아끼려고 건너뜁니다")
        return

    base = datetime(day.year, day.month, day.day, tzinfo=KST)
    total, full = 0, True
    for h in (0, 6, 12, 18):
        n, done = count_window(base + timedelta(hours=h), base + timedelta(hours=h + 6))
        total += n
        full &= done
    row = {"indicator_id": indicator_id, "date": day.isoformat(), "raw_value": float(total), "details": {"complete": full}}
    client.table("indicator_values").upsert(row, on_conflict="indicator_id,date").execute()
    print(f"[주식 쇼츠] {day} {total}개{'' if full else ' (구간 상한에 걸림)'} 저장")


if __name__ == "__main__":
    main()
