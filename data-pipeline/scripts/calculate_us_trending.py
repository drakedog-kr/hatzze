"""미국 종목을 언급한 메시지 중 창별 상위 목록을 미리 골라 저장한다 (미장 트렌딩 메시지).

국내 짝은 `calculate_telegram_trending.py`(마이그레이션 029). 점수 가중치·창·정원·
본문 정리 규칙을 그대로 따르고, 후보를 **미국 종목을 언급한 메시지로 좁힌다**.

## 후보를 고르는 방법이 국내와 다르다 — 그럴 수밖에 없다

국내는 창 안에서 `조회수 순 상위 200건`을 받아 점수로 다시 세운다. 미장에서 같은 짓을
하면 **후보 200건 중 미국 얘기는 30여 건뿐**이다(미국 언급 메시지가 전체의 16%). 정원이
36건이니 목록이 채워지지 않고, 채워져도 '조회수 높은 국내 글 사이에 낀 미국 글'이라
줄 세우기가 무의미해진다.

그래서 창 안 메시지를 **전부 받아** 미국 것만 남기고 점수로 세운다. 다만 두 가지를 지킨다.

  ⚠️ **본문을 같이 받지 않는다.** 11만 행의 text 를 받는 건 예전에 월 10GB 전송을
     만들었던 바로 그 실수다(digest 사건). 여기서는 점수에 필요한 컬럼만 받아 순위를
     정하고, **정해진 108건(3창×36)의 본문만** 따로 받는다.
  ⚠️ **필터를 걸고 OFFSET 으로 페이징하지 않는다.** `posted_at` 필터를 걸고 .range() 로
     넘기면 13만 행에서 statement timeout 이 난다(2026-08-11 미국 종목 추출이 그렇게
     죽었고 워크플로는 초록이었다). 필터 없이 통째로 받아 파이썬에서 창을 자른다 —
     30일 창은 어차피 표 전체와 거의 같다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_us_trending.py [--dry-run]

extract_telegram_us_stocks.py(미국 종목 태그) 다음에 실행한다.
"""

from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import PAGE_SIZE, get_client, load_all, load_all_keyset  # noqa: E402
from common.timeutil import KST, today_kst  # noqa: E402

# ⚠️ 국내(calculate_telegram_trending.py)·lib/telegram-data.ts 와 같은 값이어야 한다.
# 같은 화면 어법의 카드라, 가중치가 갈리면 두 목록이 다른 뜻의 '트렌딩'이 된다.
TREND_W_VIEWS = 0.5
TREND_W_FWD = 3.0
TREND_W_REPLIES = 1.5

STORE_N = 36                 # 화면이 6건씩 세 번 펼친다
STOCK_TAGS_PER_MESSAGE = 3
FIRST_COLLECTION_HOUR_KST = 9

WINDOWS: list[tuple[str, int | None]] = [("today", None), ("w7", 7), ("w30", 30)]


def window_start(days: int | None) -> datetime:
    """창의 시작 시각. `days` 가 None 이면 '오늘' 창.

    '오늘' 창은 자정에 갑자기 비지 않도록 첫 수집 시각 전에는 어제 0시로 물러난다
    (국내와 같은 규칙).
    """
    if days is not None:
        return datetime.now(timezone.utc) - timedelta(days=days)
    kst_now = datetime.now(KST)
    start = kst_now.replace(hour=0, minute=0, second=0, microsecond=0)
    if kst_now.hour < FIRST_COLLECTION_HOUR_KST:
        start -= timedelta(days=1)
    return start


def clean_text(raw: str | None) -> str:
    return re.sub(r"\s+", " ", raw or "").strip()


def score(m: dict) -> float:
    return (
        (m.get("views") or 0) * TREND_W_VIEWS
        + (m.get("forwards") or 0) * TREND_W_FWD
        + (m.get("replies") or 0) * TREND_W_REPLIES
    )


def fetch_texts(db, keys: list[tuple[str, int]]) -> dict[tuple[str, int], str]:
    """정해진 메시지들의 본문만 받아 온다.

    ⚠️ message_id 는 채널 안에서만 유일하다. `.in_()` 으로 번호만 좁히면 다른 채널의
    같은 번호가 딸려 오므로 **(채널, 번호)** 로 짝지어 골라낸다.
    """
    if not keys:
        return {}
    ids = sorted({k[1] for k in keys})
    want = set(keys)
    out: dict[tuple[str, int], str] = {}
    for i in range(0, len(ids), 300):
        chunk = ids[i : i + 300]
        rows = (
            db.table("telegram_messages")
            .select("channel_handle,message_id,text")
            .in_("message_id", chunk)
            .execute()
            .data
        ) or []
        for r in rows:
            k = (r["channel_handle"], r["message_id"])
            if k in want:
                out[k] = clean_text(r.get("text"))
    return out


def us_stock_tags(db, keys: list[tuple[str, int]], name_of: dict[str, str]) -> dict[tuple[str, int], list[str]]:
    """메시지별 **미국** 종목 태그. 국내 종목은 붙이지 않는다."""
    if not keys:
        return {}
    ids = sorted({k[1] for k in keys})
    want = set(keys)
    by_msg: dict[tuple[str, int], list[str]] = {}
    for i in range(0, len(ids), 300):
        chunk = ids[i : i + 300]
        start = 0
        while True:
            page = (
                db.table("telegram_message_us_stocks")
                .select("channel_handle,message_id,ticker")
                .in_("message_id", chunk)
                .order("id")
                .range(start, start + PAGE_SIZE - 1)
                .execute()
                .data
            ) or []
            for r in page:
                k = (r["channel_handle"], r["message_id"])
                if k not in want:
                    continue
                arr = by_msg.setdefault(k, [])
                nm = name_of.get(r["ticker"], r["ticker"])
                if nm not in arr:
                    arr.append(nm)
            if len(page) < PAGE_SIZE:
                break
            start += PAGE_SIZE
    return by_msg


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    db = get_client()
    today = today_kst().isoformat()

    us_keys = {
        (m["channel_handle"], m["message_id"])
        for m in load_all_keyset(db, "telegram_message_us_stocks", "id,channel_handle,message_id")
    }
    if not us_keys:
        print("[경고] telegram_message_us_stocks 가 비어 있습니다. "
              "먼저 extract_telegram_us_stocks.py 를 실행하세요.")
        return

    # 본문 없이 점수 컬럼만. 창은 파이썬에서 자른다(위 머리 주석의 두 함정).
    meta = load_all_keyset(
        db, "telegram_messages", "id,channel_handle,message_id,views,forwards,replies,posted_at"
    )
    us_meta = [m for m in meta if (m["channel_handle"], m["message_id"]) in us_keys and m.get("posted_at")]
    print(f"[재료] 전체 메시지 {len(meta):,}건 · 그중 미국 언급 {len(us_meta):,}건")

    name_of = {s["ticker"]: s["name_ko"] for s in load_all(db, "us_stocks", "ticker,name_ko", order_by="ticker")}

    picked: dict[str, list[dict]] = {}
    for key, days in WINDOWS:
        start = window_start(days)
        iso = start.isoformat()
        rows = [m for m in us_meta if m["posted_at"] >= iso]
        rows.sort(key=lambda m: -score(m))
        picked[key] = rows[:STORE_N]
        print(f"[트렌딩] {key}: 후보 {len(rows):,}건 → {len(picked[key])}건 (창 시작 {iso})")

    # 본문·태그는 **고른 것만** 받는다. 최대 108건이라 왕복이 가볍다.
    all_keys = [(m["channel_handle"], m["message_id"]) for rows in picked.values() for m in rows]
    texts = fetch_texts(db, all_keys)
    tags = us_stock_tags(db, all_keys, name_of)

    payload: list[dict] = []
    for key, days in WINDOWS:
        start = window_start(days)
        rank = 0
        for m in picked[key]:
            k = (m["channel_handle"], m["message_id"])
            text = texts.get(k, "")
            if not text:
                # 본문이 공백뿐인 것(미디어만)은 화면에서도 걸러진다. 순위를 건너뛰지 않고
                # 다음 것이 그 자리를 받도록 rank 를 여기서 센다.
                continue
            rank += 1
            payload.append(
                {
                    "window_key": key,
                    "rank": rank,
                    "channel_handle": m["channel_handle"],
                    "message_id": m["message_id"],
                    "text": text,
                    "views": m.get("views") or 0,
                    "forwards": m.get("forwards") or 0,
                    "replies": m.get("replies") or 0,
                    "posted_at": m["posted_at"],
                    "stocks": tags.get(k, [])[:STOCK_TAGS_PER_MESSAGE],
                    "window_start": start.isoformat(),
                    "computed_for": today,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )

    if dry_run:
        for r in payload[:5]:
            print(f"  {r['window_key']} #{r['rank']} {r['text'][:44]}… 조회{r['views']} 종목{r['stocks']}")
        print(f"[dry-run] 총 {len(payload)}건 — 저장하지 않았습니다.")
        return

    if not payload:
        # 창이 전부 비었으면 **지우지 않는다.** 수집이 실패한 날 옛 목록이라도 남는 편이
        # 빈 카드보다 낫다(국내와 같은 판단).
        print("[트렌딩] 저장할 것이 없어 기존 목록을 그대로 둡니다.")
        return

    for key, _ in WINDOWS:
        db.table("telegram_us_trending_message").delete().eq("window_key", key).execute()
    db.table("telegram_us_trending_message").upsert(payload, on_conflict="window_key,rank").execute()
    print(f"[트렌딩] 총 {len(payload)}건 저장")


if __name__ == "__main__":
    main()
