"""GitHub 검색 API로 어제(KST 하루) 생성된 트레이딩 봇 저장소 개수를 가져와
Supabase indicator_values에 upsert.

"trading-bot", "quant-trading", "stock-bot", "algo-trading" 키워드가 이름 또는
설명에 포함된 저장소 중 생성 시각이 어제 00:00~23:59:59 KST 인 것의 total_count를
그대로 어제 날짜 행의 raw_value로 쓴다(fetch_youtube_shorts 와 같은 꼴).

예전엔 '실행 시각부터 거꾸로 24시간'을 세어 UTC 날짜 행에 적었다. 아침 실행(09:00 KST 전)은
UTC 로 아직 전날이라 D 행에 D+1 아침까지의 24시간이 들어갔고, 실행이 09:00 을 넘기면 D+1 행에
들어가 같은 꼴의 값이 실행 시각에 따라 다른 날로 갔다(2026-10-16 전수 검사 4). KST 하루로 고정하면
아침·저녁 어느 실행이든 같은 구간을 센다. 지난 행은 그대로 둔다.

인증 없이도 호출 가능하지만 검색 API는
rate limit이 낮아(비인증 10회/분 vs 인증 30회/분), .env.local에 GITHUB_TOKEN이
있으면 사용하고 없으면 비인증으로 진행한다.

GitHub 검색 API는 생성일 범위(created:YYYY-MM-DD..YYYY-MM-DD)로 과거 특정
기간을 조회하는 것 자체는 가능하지만, 결과는 "그 기간에 생성됐고 지금까지
삭제되지 않고 살아남은" 저장소만 잡히는 현재 시점 기준 재구성이라 당시의 진짜
값과 다르다. 게다가 검색 API 자체의 낮은 rate limit 때문에 365일치를 백필하려면
수백 번을 호출해야 한다. 그래서 백필은 하지 않고 매일 어제 하루치만 세어 누적한다.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import GITHUB_TOKEN  # noqa: E402
from common.http_client import get_with_retry  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.indicator import ensure_indicator  # noqa: E402
from common.timeutil import KST, today_kst  # noqa: E402

GITHUB_SEARCH_URL = "https://api.github.com/search/repositories"
KEYWORDS = ["trading-bot", "quant-trading", "stock-bot", "algo-trading"]
REQUEST_TIMEOUT_SEC = 15

INDICATOR_SLUG = "github_trading_bot_repos"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "깃헙 거래봇 생성 수",
    "category": "감성",
    "headline": "새로 만들어진 트레이딩봇 저장소",
    # 카드 설명은 **조건절로 쓴다** — "이 값이 높으면 무슨 뜻인가"이지 "지금 그렇다"가 아니다.
    # 예전 문장("개발자까지 트레이딩 봇을 만들 만큼 관심이 높아졌습니다")은 단정문이라, 값이
    # 낮은 날에도 관심이 높다고 단언했다(2026-07-30 실측: 과열도 46 · 126건 vs 초고온 기준
    # 179건인데 저 문장이 그대로 떠 있었다). 공개 지표 25개 중 조건절이 없는 건 이것뿐이었다.
    # 표기는 headline 의 '트레이딩봇'에 맞춘다(예전엔 '트레이딩 봇'이라 한 카드 안에서 갈렸다).
    "description_beginner": "봇 저장소가 늘면 개발자까지 뛰어든 것입니다",
    "unit": "건",
    # weight 미지정 -> 기본값 1(검증 전 새 지표 안전장치)
}


def fetch_trading_bot_repo_count(day: date) -> int:
    """day(KST) 하루 동안 생성된 저장소 수. 검색 구간 A..B 는 양끝을 포함한다."""
    start = datetime(day.year, day.month, day.day, tzinfo=KST)
    window = f"{start.isoformat()}..{(start + timedelta(days=1, seconds=-1)).isoformat()}"
    # GitHub 검색 API는 괄호로 묶은 OR절 전체에 in: 한정자를 적용하지 않는다
    # (실제 호출로 확인 — `("a" OR "b") in:name,description`은 0건을 반환).
    # 항목마다 in: 한정자를 반복해서 붙여야 각 키워드가 이름/설명에서 매칭된다.
    # created: 같은 bare 한정자는 OR로 묶인 전체 절에 공통으로 적용된다.
    keyword_clause = " OR ".join(f'"{kw}" in:name,description' for kw in KEYWORDS)
    # 시각에 +09:00 을 붙여도 깃헙이 그대로 읽는다(2026-10-16 확인: 같은 구간을 Z 로 적은 질의와 건수가 같다).
    query = f"{keyword_clause} created:{window}"

    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    resp = get_with_retry(
        GITHUB_SEARCH_URL,
        label="GitHub",
        params={"q": query},
        headers=headers,
        timeout=REQUEST_TIMEOUT_SEC,
    )
    resp.raise_for_status()
    data = resp.json()
    return int(data.get("total_count", 0))


def main() -> None:
    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    # 어제 하루는 끝났으니 아침·저녁 실행이 같은 구간을 센다. 저녁에 다시 세면 그사이 지워진 저장소만큼 덮어쓴다.
    day = today_kst() - timedelta(days=1)
    count = fetch_trading_bot_repo_count(day)
    print(f"[GitHub] {day}(KST) 하루 생성된 트레이딩봇 저장소: {count}건")

    client.table("indicator_values").upsert(
        {"indicator_id": indicator_id, "date": day.isoformat(), "raw_value": float(count)},
        on_conflict="indicator_id,date",
    ).execute()
    print(f"[Supabase] indicator_values upsert 완료: date={day}, raw_value={count}")


if __name__ == "__main__":
    main()
