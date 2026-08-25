"""트렌딩 메시지 카드의 창별 상위 목록을 미리 골라 저장한다(마이그레이션 029).

화면(/kadera '트렌딩 메시지')이 렌더마다 하던 일을 여기로 옮긴 것이다. 창마다
telegram_messages 를 **조회수 순 상위 200건** 받아 점수로 다시 줄 세우고 36건만 쓴다.
조회수 순과 점수 순이 달라서 후보를 넉넉히 받아야 하는 구조인데, 표가 11.8만 행이고
그 전부가 30일 창 안이라(수집 시작이 22일 전) 30일 창은 사실상 표 전체를 다룬다.

실측(2026-08-07 콜드 트레이스): 세 창 3왕복의 소요 합이 11,011ms, 웜에서는 596ms.

⚠️ 그 3왕복이 2026-08-12 저녁 실행에서 `57014`(statement timeout)로 죽었다. 조회수 순
정렬에 **본문까지 실어 나른 것**이 원인이라, 지금은 줄 세우기와 본문 받기를 나눴다
(pick_top 주석의 실측 참고).

⚠️ **미장 전용 글은 뺀다.** 미국 종목만 붙은 글은 미장 카더라의 트렌딩 카드가 이미
싣는다. 국내 종목이 하나라도 붙어 있으면 빼지 않는다 — 'SK하이닉스 · 마이크론' 같은
글은 국장 이야기이기도 하다(2026-08-26 실측: 30일 창 36건 중 미국 태그가 11건이었고
그중 4건이 그런 글이었다). 종목 태그가 아무것도 없는 시황·금리 글도 그대로 남는다 —
빼는 기준은 '국내 것이 아님'이 아니라 '미장 것임'이다.

그래서 **extract_telegram_us_stocks.py 뒤에 실행해야 한다**(워크플로 순서가 이미
그렇다). 그 표가 비었거나 조회가 실패하면 아무것도 빼지 않고 지나간다 — 목록이 통째로
비는 것보다 미장 글이 몇 건 섞이는 쪽이 낫다.

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
# 본문을 뒤늦게 받을 때 한 번에 묶는 id 수(위 fetch_texts 주석 참고).
TEXT_CHUNK = 50
# 태그 표를 id 로 걸을 때의 조각. 같은 이유로 나눈다 — `.in_()` 목록이 길면 요청이
# 안 나간다.
TAG_ID_CHUNK = 50

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


def fetch_texts(db, ids: list[str]) -> dict[str, str]:
    """id → 본문. 줄 세우기가 끝난 뒤 **이긴 후보의 본문만** 따로 받는다.

    한 번에 다 받지 않고 쪼개는 이유: `.in_()` 목록이 길면 URL 이 커져 **요청 자체가
    안 나간다**(테마 팝오버가 그렇게 조용히 죽었다 — PR #336). 200건이면 네 번이고
    한 번이 0.02초대라 왕복이 늘어도 체감이 없다.
    """
    out: dict[str, str] = {}
    for i in range(0, len(ids), TEXT_CHUNK):
        page = (
            db.table("telegram_messages")
            .select("id,text")
            .in_("id", ids[i : i + TEXT_CHUNK])
            .execute()
            .data
        ) or []
        for r in page:
            out[r["id"]] = r["text"]
    return out


def tagged_keys(db, table: str, ids: list[int]) -> set[tuple[str, int]]:
    """`table` 에 행이 있는 (채널, 번호) 짝. 종목 이름은 안 받는다 — 있는지만 본다.

    ⚠️ message_id 는 채널 안에서만 유일하다(stock_tags 주석과 같은 함정). 번호로 좁혀
    받은 뒤 **(채널, 번호)** 로 짝짓는다. 한 번호가 여러 채널에 있어 행이 1,000행 상한에
    걸릴 수 있으므로 페이징한다.
    """
    out: set[tuple[str, int]] = set()
    for i in range(0, len(ids), TAG_ID_CHUNK):
        chunk = ids[i : i + TAG_ID_CHUNK]
        start = 0
        while True:
            page = (
                db.table(table)
                .select("channel_handle,message_id")
                .in_("message_id", chunk)
                .order("id")
                .range(start, start + PAGE_SIZE - 1)
                .execute()
                .data
            ) or []
            out.update((r["channel_handle"], r["message_id"]) for r in page)
            if len(page) < PAGE_SIZE:
                break
            start += PAGE_SIZE
    return out


def us_only_keys(db, rows: list[dict]) -> set[tuple[str, int]]:
    """후보 중 **미국 종목만** 붙은 메시지. 국장 목록에서 뺄 것들이다(머리 주석 참고).

    국내 태그를 확인하는 두 번째 조회는 **미국 태그가 붙은 것만** 대상으로 한다. 후보
    200건 전부의 국내 태그를 받으면 한 건이 여러 종목을 갖는 표라 행이 수천으로 불어난다.

    조회가 실패하면 빈 집합을 돌려준다 — 그날 목록에 미장 글이 섞일 뿐, 카드가 비지는
    않는다. 이 갈래가 트렌딩 전체를 데려가지 않게 하는 것이 우선이다.
    """
    want = {(m["channel_handle"], m["message_id"]) for m in rows}
    if not want:
        return set()
    try:
        us = tagged_keys(db, "telegram_message_us_stocks", sorted({k[1] for k in want})) & want
        if not us:
            return set()
        kr = tagged_keys(db, "telegram_message_stocks", sorted({k[1] for k in us}))
    except Exception as e:  # noqa: BLE001 — 무엇이 터지든 목록은 남긴다
        print(f"[경고] 미장 글을 못 가려냈습니다. 이번 회차는 그대로 둡니다: {e}")
        return set()
    return us - kr


def pick_top(db, start: datetime) -> tuple[list[dict], int]:
    """창 안에서 점수 상위 STORE_N 건과, 그 앞에서 뺀 미장 전용 글의 수.

    후보는 조회수 순 CANDIDATES 건에서 고른다.

    ⚠️ **줄 세울 때는 본문을 받지 않는다.** 점수(score)가 조회·공유·댓글만 쓰므로 본문은
    정렬에 아무 쓸모가 없는데, 같이 실으면 DB 가 **본문을 품은 넓은 행 수만 건을 정렬**
    하게 된다. 2026-08-12 저녁 실행에서 이 질의가 `57014`(statement timeout)로 죽어
    그날 트렌딩 카드가 갱신되지 않았다.

    실측(2026-08-13, 창 3일 · 표 156,180행):
        본문 포함  콜드 1.99초 · 웜 0.08초
        본문 제외  콜드 0.05초 · 웜 0.04초   ← 40배

    ⭐ **'오늘' 창이 제일 위험하다.** 창이 좁을수록 안전할 것 같지만 반대다 — `views desc`
    로 훑다가 창 안에 드는 200건을 만날 때까지 더 멀리 걸어야 한다. 옛 판을 오늘 다시
    돌려 보니 '오늘' 창에서 **또 57014 로 죽었고**(같은 자리 재현), 다음 회차가 3.37초,
    그다음이 0.20초였다. 새 판은 같은 자리에서 1.01초 → 0.28초다.
    ⚠️ 그래서 **웜 값만 보면 새 판이 더 느려 보인다**(본문을 따로 받는 왕복이 붙는다).
    천장은 statement 하나에 걸리지 총 소요에 걸리지 않는다 — 볼 값은 콜드 최악값이다.

    본문은 아래에서 후보 id 로 따로 받는다. 받는 대상이 같으니 결과는 같다 —
    필터(`text is not null`)·정렬(`views desc`)·후보 수가 그대로이기 때문이다.
    """
    rows = (
        db.table("telegram_messages")
        .select("id,channel_handle,message_id,views,forwards,replies,posted_at")
        .gte("posted_at", start.isoformat())
        .not_.is_("text", "null")
        .order("views", desc=True, nullsfirst=False)
        .limit(CANDIDATES)
        .execute()
        .data
    ) or []
    # 미장 전용 글은 **본문을 받기 전에** 뺀다 — 어차피 안 실을 것의 본문까지 나를
    # 이유가 없다.
    drop = us_only_keys(db, rows)
    if drop:
        rows = [m for m in rows if (m["channel_handle"], m["message_id"]) not in drop]
    texts = fetch_texts(db, [m["id"] for m in rows])
    cleaned = []
    for m in rows:
        t = clean_text(texts.get(m["id"]))
        if not t:  # 공백뿐인 본문은 화면에서도 걸러진다
            continue
        cleaned.append({**m, "text": t, "_score": score(m)})
    cleaned.sort(key=lambda m: -m["_score"])
    return cleaned[:STORE_N], len(drop)


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
        top, dropped = pick_top(db, start)
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
        print(
            f"[트렌딩] {key}: {len(top)}건 (창 시작 {start.isoformat()}) · 미장 전용 {dropped}건 제외"
        )

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
