"""트렌딩 메시지 카드의 창별 상위 목록을 미리 골라 저장한다(마이그레이션 029).

화면(/kadera '트렌딩 메시지')이 렌더마다 하던 일을 여기로 옮긴 것이다. 창마다
telegram_messages 를 **조회수 순 상위 200건** 받아 점수로 다시 줄 세우고 36건만 쓴다.
조회수 순과 점수 순이 달라서 후보를 넉넉히 받아야 하는 구조인데, 표가 11.8만 행이고
그 전부가 30일 창 안이라(수집 시작이 22일 전) 30일 창은 사실상 표 전체를 다룬다.

실측(2026-08-07 콜드 트레이스): 세 창 3왕복의 소요 합이 11,011ms, 웜에서는 596ms.

**캐싱이 아니라 계산을 옮기는 것이다.** telegram_messages 는 파이프라인이 돌 때만
바뀐다 — 조회수·공유수도 그때 갱신된다. 실행 사이에 이 36줄은 상수다.

⚠️ **lib/telegram-data.ts 의 getTrendingMessages 를 손으로 옮긴 사본이다.** Python 과
TS 라 import 로 공유할 수 없다(common/surging.py·common/channel_breadth.py 와 같은
사정). 저쪽 가중치·후보 수·본문 정리 규칙을 바꾸면 여기도 바꿔야 한다. 그 사본이
어긋나면 화면 목록이 조용히 달라진다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_telegram_trending.py [--dry-run]

fetch_telegram.py(수집) · extract_telegram_stocks.py(종목 태그) 다음에 실행한다.
"""

from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import PAGE_SIZE, get_client  # noqa: E402
from common.timeutil import KST, today_kst  # noqa: E402

# ⚠️ lib/telegram-data.ts 의 TREND_W_* 와 같은 값이어야 한다.
TREND_W_VIEWS = 0.5
TREND_W_FWD = 3.0
TREND_W_REPLIES = 1.5

# 후보 수도 저쪽(.limit(200))과 같아야 한다. 조회수 순으로 자른 뒤 점수로 다시 세우므로,
# 이 수를 줄이면 공유가 많고 조회가 적은 메시지가 목록에서 조용히 사라진다.
CANDIDATES = 200
# 화면이 6건씩 세 번 펼치므로 36건을 저장한다(app/kadera/page.tsx 의 getTrendingMessages 인자).
STORE_N = 36
# 종목 태그는 메시지당 최대 3개까지 화면에 붙는다.
STOCK_TAGS_PER_MESSAGE = 3

# ⚠️ lib/telegram-data.ts 의 FIRST_COLLECTION_HOUR_KST 와 같은 값이어야 한다.
FIRST_COLLECTION_HOUR_KST = 9

# 화면 탭과 일대일. (저장 키, 창 길이) — 'today' 는 아래에서 따로 계산한다.
WINDOWS: list[tuple[str, int | None]] = [("today", None), ("w7", 7), ("w30", 30)]


def window_start(days: int | None) -> datetime:
    """창의 시작 시각. `days` 가 None 이면 '오늘' 창.

    '오늘' 창은 자정에 갑자기 비지 않도록 **첫 수집 시각 전에는 어제 0시**로 물러난다
    (lib/telegram-data.ts 의 trendingTodayStartISO 와 같은 규칙). 파이프라인은 그 시각
    이후에만 도므로 저장값의 시작점은 늘 '그 날 0시'가 되고, 새벽 방문자가 화면에서
    보던 '어제 0시'와 같은 지점이다.
    """
    if days is not None:
        return datetime.now(timezone.utc) - timedelta(days=days)
    kst_now = datetime.now(KST)
    start = kst_now.replace(hour=0, minute=0, second=0, microsecond=0)
    if kst_now.hour < FIRST_COLLECTION_HOUR_KST:
        start -= timedelta(days=1)
    return start


def clean_text(raw: str | None) -> str:
    """본문 정리 — 저쪽 `.replace(/\\s+/g, " ").trim()` 과 같은 규칙."""
    return re.sub(r"\s+", " ", raw or "").strip()


def score(m: dict) -> float:
    return (
        (m.get("views") or 0) * TREND_W_VIEWS
        + (m.get("forwards") or 0) * TREND_W_FWD
        + (m.get("replies") or 0) * TREND_W_REPLIES
    )


def pick_top(db, start: datetime) -> list[dict]:
    """창 안에서 점수 상위 STORE_N 건. 후보는 조회수 순 CANDIDATES 건에서 고른다."""
    rows = (
        db.table("telegram_messages")
        .select("channel_handle,message_id,text,views,forwards,replies,posted_at")
        .gte("posted_at", start.isoformat())
        .not_.is_("text", "null")
        .order("views", desc=True, nullsfirst=False)
        .limit(CANDIDATES)
        .execute()
        .data
    ) or []
    cleaned = []
    for m in rows:
        t = clean_text(m.get("text"))
        if not t:  # 공백뿐인 본문은 화면에서도 걸러진다
            continue
        cleaned.append({**m, "text": t, "_score": score(m)})
    cleaned.sort(key=lambda m: -m["_score"])
    return cleaned[:STORE_N]


def stock_tags(db, top: list[dict]) -> dict[tuple[str, int], list[str]]:
    """메시지별 종목명 태그.

    ⚠️ message_id 는 채널 안에서만 유일하다. 채널을 안 걸면 다른 채널의 같은 번호
    메시지가 딸려 오므로(한 번호가 최대 60행) **(채널, 번호)** 로 짝짓는다. 행이 많아
    1,000행 상한에 걸릴 수 있어 페이징한다 — 안 하면 태그가 조용히 사라진다.
    """
    if not top:
        return {}
    ids = [m["message_id"] for m in top]
    rows: list[dict] = []
    start = 0
    while True:
        page = (
            db.table("telegram_message_stocks")
            .select("channel_handle,message_id,stock_code")
            .in_("message_id", ids)
            .order("id")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
            .data
        ) or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    if not rows:
        return {}

    codes = sorted({r["stock_code"] for r in rows})
    name_of: dict[str, str] = {}
    for i in range(0, len(codes), 500):  # .in() 목록이 길면 응답이 잘린다
        chunk = codes[i : i + 500]
        for s in (
            db.table("stocks").select("code,name").in_("code", chunk).execute().data or []
        ):
            name_of[s["code"]] = s["name"]

    by_msg: dict[tuple[str, int], list[str]] = {}
    for r in rows:
        key = (r["channel_handle"], r["message_id"])
        arr = by_msg.setdefault(key, [])
        nm = name_of.get(r["stock_code"])
        if nm and nm not in arr:
            arr.append(nm)
    return by_msg


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    db = get_client()
    today = today_kst().isoformat()
    payload: list[dict] = []

    for key, days in WINDOWS:
        start = window_start(days)
        top = pick_top(db, start)
        tags = stock_tags(db, top)
        for rank, m in enumerate(top, 1):
            payload.append(
                {
                    "window_key": key,
                    "rank": rank,
                    "channel_handle": m["channel_handle"],
                    "message_id": m["message_id"],
                    "text": m["text"],
                    "views": m.get("views") or 0,
                    "forwards": m.get("forwards") or 0,
                    "replies": m.get("replies") or 0,
                    "posted_at": m["posted_at"],
                    "stocks": tags.get((m["channel_handle"], m["message_id"]), [])[
                        :STOCK_TAGS_PER_MESSAGE
                    ],
                    "window_start": start.isoformat(),
                    "computed_for": today,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        print(f"[트렌딩] {key}: {len(top)}건 (창 시작 {start.isoformat()})")

    if dry_run:
        for r in payload[:5]:
            print(f"  {r['window_key']} #{r['rank']} {r['text'][:40]}… 조회{r['views']} 종목{r['stocks']}")
        print(f"[dry-run] 총 {len(payload)}건 — 저장하지 않았습니다.")
        return

    if not payload:
        # 창이 전부 비었으면 **지우지 않는다.** 수집이 실패한 날 옛 목록이라도 남는 편이
        # 빈 카드보다 낫고, 화면은 어차피 창을 대조하지 않고 최신 저장분을 쓴다.
        print("[트렌딩] 저장할 것이 없어 기존 목록을 그대로 둡니다.")
        return

    # 정원이 줄어든 날(예: 36 → 20) 옛 뒷줄이 남지 않도록 창별로 지우고 다시 넣는다.
    for key, _ in WINDOWS:
        db.table("telegram_trending_message").delete().eq("window_key", key).execute()
    db.table("telegram_trending_message").upsert(payload, on_conflict="window_key,rank").execute()
    print(f"[트렌딩] 총 {len(payload)}건 저장")


if __name__ == "__main__":
    main()
