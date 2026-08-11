"""미국 종목의 일별 집계 두 벌을 만든다.

  telegram_us_stock_daily    (날짜 × 티커)  급부상 종목·종목 리포트·테마의 토대
  telegram_us_channel_daily  (날짜 × 채널)  채널의 미장 비중 · 국장 vs 미장 관심 배분

국내 짝은 `calculate_stock_daily.py`. **가중치와 컬럼을 그대로 맞춘다** —
두 화면이 같은 뜻의 숫자를 다르게 계산하면 나중에 두 시장을 나란히 놓는 카드를 못 만든다.

## 채널 집계를 여기 같이 두는 이유

메시지를 어차피 전량 읽는다. 채널별 비중을 따로 훑으면 같은 전량 조회가 한 번 더 도는데,
이 표들은 이미 statement timeout 근처에서 논다(미장 사전을 만들 때 ILIKE 집계가 8초에
전부 막혔다). 한 번 읽어 두 벌을 만든다.

## 날짜에 대한 주의

집계 기준은 메시지 작성일(KST)이다. **미국장 하루와 하루 어긋난다** — 미국장은 KST
새벽 5시에 닫히고 정리글이 그날 아침에 쏟아진다(실측: 새벽 4시~아침 8시가 미국 언급
비중 20~28%로 가장 높다). 화면에서 이 날짜를 "그날 장"이라고 쓰면 안 된다.

extract 가 message_us_stocks 를 전량 재생성하므로 여기도 매 실행 전량 재계산해 맞춘다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_us_stock_daily.py --dry-run   # 계산·미리보기만
    python scripts/calculate_us_stock_daily.py             # 저장
"""

from __future__ import annotations

import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client, load_all, load_all_keyset  # noqa: E402
from common.timeutil import KST, today_kst  # noqa: E402

# 트렌딩 점수 가중치. 국내(calculate_stock_daily)와 같은 값이어야 한다.
W_VIEWS, W_FWD, W_REPLIES = 0.5, 3.0, 1.5


def trending_score(m: dict) -> float:
    return (
        (m["views"] or 0) * W_VIEWS
        + (m["forwards"] or 0) * W_FWD
        + (m["replies"] or 0) * W_REPLIES
    )


def kst_date(posted_at: str) -> str:
    return datetime.fromisoformat(posted_at).astimezone(KST).date().isoformat()


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    db = get_client()

    messages = {
        (m["channel_handle"], m["message_id"]): m
        for m in load_all_keyset(
            db,
            "telegram_messages",
            "id,channel_handle,message_id,posted_at,views,forwards,replies",
        )
    }
    us_mentions = load_all_keyset(
        db, "telegram_message_us_stocks", "id,channel_handle,message_id,ticker"
    )
    # 국내 언급은 채널 집계의 kr_msgs 에만 쓴다(국장 vs 미장 배분 카드).
    kr_mentions = load_all_keyset(
        db, "telegram_message_stocks", "id,channel_handle,message_id,stock_code"
    )
    print(f"메시지 {len(messages):,} · 미국 언급 {len(us_mentions):,} · 국내 언급 {len(kr_mentions):,}")

    # ── (날짜, 티커) 집계 ────────────────────────────────────────────────
    agg: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"mentions": 0, "channels": set(), "views": 0, "fwd": 0, "weighted": 0.0}
    )
    for men in us_mentions:
        msg = messages.get((men["channel_handle"], men["message_id"]))
        if not msg or not msg["posted_at"]:
            continue
        a = agg[(kst_date(msg["posted_at"]), men["ticker"])]
        a["mentions"] += 1
        a["channels"].add(men["channel_handle"])
        a["views"] += msg["views"] or 0
        a["fwd"] += msg["forwards"] or 0
        a["weighted"] += trending_score(msg)

    stock_rows = [
        {
            "date": date,
            "ticker": ticker,
            "mention_count": a["mentions"],
            "channel_count": len(a["channels"]),
            "sum_views": a["views"],
            "sum_forwards": a["fwd"],
            "weighted_score": round(a["weighted"], 1),
        }
        for (date, ticker), a in agg.items()
    ]

    # ── (날짜, 채널) 집계 ────────────────────────────────────────────────
    # 분모는 **그 채널의 그날 전체 메시지**다. 본문 없는 미디어 메시지도 센다 —
    # "이 채널이 미국을 얼마나 다루나"의 분모는 발행량이지 본문 있는 것만이 아니다.
    us_keys = {(m["channel_handle"], m["message_id"]) for m in us_mentions}
    kr_keys = {(m["channel_handle"], m["message_id"]) for m in kr_mentions}

    ch: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"total": 0, "us": 0, "kr": 0}
    )
    for key, msg in messages.items():
        if not msg["posted_at"]:
            continue
        c = ch[(kst_date(msg["posted_at"]), msg["channel_handle"])]
        c["total"] += 1
        if key in us_keys:
            c["us"] += 1
        if key in kr_keys:
            c["kr"] += 1

    channel_rows = [
        {
            "date": date,
            "channel_handle": handle,
            "total_msgs": c["total"],
            "us_msgs": c["us"],
            "kr_msgs": c["kr"],
        }
        for (date, handle), c in ch.items()
    ]

    print(f"집계: 종목 {len(stock_rows):,}행 · 채널 {len(channel_rows):,}행")

    # ── 미리보기 ────────────────────────────────────────────────────────
    names = {s["ticker"]: s["name_ko"] for s in load_all(db, "us_stocks", "ticker,name_ko", order_by="ticker")}
    dates = sorted({r["date"] for r in stock_rows})
    if dates:
        latest = dates[-1]
        top = sorted(
            (r for r in stock_rows if r["date"] == latest),
            key=lambda r: -r["weighted_score"],
        )[:10]
        print(f"\n=== 최신일({latest}) 주목 종목 TOP 10 ===")
        for r in top:
            print(f"  {r['weighted_score']:>12,.0f}  {names.get(r['ticker'], r['ticker'])} "
                  f"({r['ticker']}) · {r['mention_count']}회 {r['channel_count']}채널")

    by_ch: dict[str, dict] = defaultdict(lambda: {"total": 0, "us": 0})
    for r in channel_rows:
        by_ch[r["channel_handle"]]["total"] += r["total_msgs"]
        by_ch[r["channel_handle"]]["us"] += r["us_msgs"]
    ranked = sorted(
        ((h, v) for h, v in by_ch.items() if v["total"] >= 100),
        key=lambda kv: -kv[1]["us"] / kv[1]["total"],
    )[:10]
    print("\n=== 미장 비중 높은 채널 TOP 10 (메시지 100건 이상) ===")
    for handle, v in ranked:
        print(f"  {v['us']/v['total']*100:>5.1f}%  {handle}  ({v['us']}/{v['total']})")

    day_tot: dict[str, dict] = defaultdict(lambda: {"total": 0, "us": 0, "kr": 0})
    for r in channel_rows:
        d = day_tot[r["date"]]
        d["total"] += r["total_msgs"]
        d["us"] += r["us_msgs"]
        d["kr"] += r["kr_msgs"]
    print("\n=== 국장 vs 미장 관심 배분 (최근 7일) ===")
    for date in sorted(day_tot)[-7:]:
        d = day_tot[date]
        print(f"  {date}  전체 {d['total']:>6,}  미국 {d['us']:>5,} ({d['us']/d['total']*100:>4.1f}%)"
              f"  국내 {d['kr']:>6,} ({d['kr']/d['total']*100:>4.1f}%)")

    if dry_run:
        print("\n--dry-run: DB에 저장하지 않았습니다.")
        return

    # 재실행 = 전량 재계산이라 upsert 로 갈아 끼운다. 한 요청이 크면 statement timeout
    # 에 걸리므로 다른 쓰기와 같은 500행 단위로 쪼갠다.
    for i in range(0, len(stock_rows), 500):
        db.table("telegram_us_stock_daily").upsert(
            stock_rows[i : i + 500], on_conflict="date,ticker"
        ).execute()
    for i in range(0, len(channel_rows), 500):
        db.table("telegram_us_channel_daily").upsert(
            channel_rows[i : i + 500], on_conflict="date,channel_handle"
        ).execute()
    save_breadth(db, messages, us_mentions)
    print(f"\n[Supabase] telegram_us_stock_daily {len(stock_rows):,}행 · "
          f"telegram_us_channel_daily {len(channel_rows):,}행 저장 완료")


BREADTH_WINDOW_DAYS = 14


def save_breadth(db, messages: dict, us_mentions: list[dict]) -> None:
    """'관심의 폭' — 창 안에서 그 종목을 언급한 **서로 다른** 채널 수 (마이그레이션 037).

    ⚠️ **위에서 만든 일별 channel_count 로 갈음하면 안 된다.** 그 열은 그날 하루의 채널
    수라 여러 날을 묶어도 합집합이 아니다. 화면은 그동안 일별 최댓값을 쓰고 있었는데
    (합치면 같은 채널을 며칠치 겹쳐 세니까) 실제보다 크게 작다 — 실측으로 엔비디아가
    화면엔 100채널인데 창 전체로는 228채널이다. 국내 쪽이 같은 함정을 이미 겪었다
    (common/channel_breadth.py 주석).

    여기서 세는 이유는 하나뿐이다 — **원자료가 이미 메모리에 있다.** 화면이 렌더마다
    38,319행을 다시 읽으면 2.37초로 페이지 전체 렌더보다 오래 걸린다.

    표가 없으면(마이그레이션 미적용) 조용히 넘어간다. 이 스텝의 본 일은 위 두 표다.
    """
    end = today_kst()
    first = (end - timedelta(days=BREADTH_WINDOW_DAYS - 1)).isoformat()
    last = end.isoformat()

    chans: dict[str, set[str]] = defaultdict(set)
    counts: dict[str, int] = defaultdict(int)
    for m in us_mentions:
        msg = messages.get((m["channel_handle"], m["message_id"]))
        if not msg or not msg.get("posted_at"):
            continue
        d = kst_date(msg["posted_at"])
        if not (first <= d <= last):
            continue
        chans[m["ticker"]].add(m["channel_handle"])
        counts[m["ticker"]] += 1

    rows = [
        {
            "as_of_date": last,
            "window_days": BREADTH_WINDOW_DAYS,
            "ticker": t,
            "channel_count": len(ch),
            "mention_count": counts[t],
        }
        for t, ch in sorted(chans.items())
    ]
    if not rows:
        print("[안내] 창 안 미국 언급이 없어 관심의 폭을 건너뜁니다.")
        return
    try:
        # 창 스냅샷이라 옛 as_of_date 는 안 남긴다(안 지우면 표가 매일 177행씩 자란다).
        db.table("telegram_us_stock_breadth").delete().neq("as_of_date", last).execute()
        for i in range(0, len(rows), 500):
            db.table("telegram_us_stock_breadth").upsert(
                rows[i : i + 500], on_conflict="as_of_date,window_days,ticker"
            ).execute()
    except Exception as exc:  # noqa: BLE001
        print(f"[안내] telegram_us_stock_breadth 저장을 건너뜁니다({type(exc).__name__}) — "
              "마이그레이션 037 적용 여부를 확인하세요.")
        return
    top = sorted(rows, key=lambda r: -r["channel_count"])[:3]
    print(f"[Supabase] telegram_us_stock_breadth {len(rows)}행 저장 (최근 {BREADTH_WINDOW_DAYS}일 · {last} 기준)")
    print("  가장 널리: " + " · ".join(f"{r['ticker']} {r['channel_count']}채널" for r in top))


if __name__ == "__main__":
    main()
