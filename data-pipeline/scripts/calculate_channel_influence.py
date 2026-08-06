"""채널 영향력 점수(Influence Score)를 노션 계산법대로 매일 계산해 저장한다.

각 활성 채널마다 4개 지표를 구간 점수로 환산한 뒤 합산·보정한다:
  - 뷰레이트(%)  = 최근 ~30개 게시물 평균 조회수 / 구독자수 × 100  (최대 35)
  - 포워드율(%) = 최근 ~30개 게시물 포워드 합 / 조회수 합 × 100     (최대 30)
  - 구독자 규모 티어                                              (최대 20)
  - 활동성       = 최근 7일 게시물 수                              (최대 15)
  Raw = 네 점수 합(최대 100)
  Influence Score = 48 + (Raw/100)×52                     (일반, 뷰레이트 ≥ 3%)
                  = min((48 + (Raw/100)×52)×0.85, 70)     (성장중, 뷰레이트 < 3%)

결과를 telegram_channel_stats 의 오늘(KST) 행에 upsert한다(7D 변동 비교용 일별 저장).
데이터는 Telethon 수집분(telegram_messages) + telegram_channels.subscriber_count 를
쓰므로, fetch_telegram.py 다음에 실행한다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/calculate_channel_influence.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client, load_all  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

RECENT_POSTS = 30  # 평균 조회수/포워드율 계산에 쓰는 최근 게시물 수
GROWING_VIEW_RATE = 3.0  # 이 뷰레이트(%) 미만이면 "성장 중" 등급
GROWING_PENALTY = 0.85
GROWING_CAP = 70.0

# (하한 임계값, 점수) 내림차순 — 값이 임계값 이상인 첫 구간의 점수를 쓴다.
VIEW_RATE_TIERS = [(30, 35), (20, 30), (15, 25), (10, 20), (5, 14), (3, 8), (0, 3)]
FWD_RATE_TIERS = [(10, 30), (5, 25), (2, 20), (1, 14), (0.5, 8), (0, 3)]
SUB_TIERS = [(50000, 20), (20000, 16), (10000, 12), (5000, 8), (1000, 5), (200, 2), (0, 0)]
ACTIVITY_TIERS = [(20, 15), (10, 12), (5, 8), (2, 4), (0, 1)]


def tier_score(value: float, tiers: list[tuple[float, int]]) -> int:
    for threshold, score in tiers:
        if value >= threshold:
            return score
    return tiers[-1][1]


def save_collection_stats(
    db, today: str, week_ago: str, collected: list[dict], active_7d: int
) -> None:
    """히어로 '모니터링 현황' 네 줄을 세어 한 벌짜리 표에 덮어쓴다(마이그레이션 027).

    화면이 렌더마다 세던 것을 여기로 옮긴 것이다. 그중 '총 메시지 7일'은 창 안이
    4.9만 행이라, 버퍼가 식어 있으면 그 한 줄이 **6,946ms** 였다(2026-08-07 콜드 트레이스
    실측. 같은 질의가 웜에서는 236ms). telegram_messages·telegram_message_stocks·
    telegram_channels 는 전부 파이프라인이 돌 때만 바뀌므로 실행 사이에는 상수다.

    ⚠️ **messages_7d 는 채널로 좁히지 않는다.** 바로 위 weekly_posts 는 채널마다 세지만
    이건 창 안의 모든 메시지를 센다 — 수집이 끊긴 채널이 남긴 옛 글도 포함하는 것이
    화면 쪽의 의도다(lib/telegram-data.ts 의 messages7d 주석). weekly_posts 합으로
    갈음하면 그만큼 조용히 적게 나온다.

    ⚠️ **collected 는 '목록에 있는 채널'이 아니라 '실제로 열리는 채널'이다.** 호출자가
    channel_id·access_hash 가 둘 다 있는 것만 걸러서 넘긴다 — fetch_telegram.py 가 여는
    기준과 한 글자도 다르지 않아야 화면의 '모니터링 채널' 숫자가 사실이 된다.

    창(week_ago)은 호출자에서 그대로 받는다. weekly_posts 와 **같은 순간, 같은 창**으로
    세야 화면의 두 '7일'(활성 채널 7일 · 총 메시지 7일)이 같은 시점을 말한다.

    표가 없으면(마이그레이션 미적용) 조용히 넘어간다 — 이 스크립트의 본래 일은
    영향력 점수 저장이고 그건 이미 위에서 끝났다. 화면은 옛 방식으로 되돌아간다.
    """
    messages_7d = (
        db.table("telegram_messages")
        .select("id", count="exact")
        .gte("posted_at", week_ago)
        .limit(1)
        .execute()
        .count
    ) or 0
    # 누적 종목 언급. 이것도 화면이 렌더마다 세던 count 다.
    total_mentions = (
        db.table("telegram_message_stocks")
        .select("id", count="exact")
        .limit(1)
        .execute()
        .count
    ) or 0
    try:
        db.table("telegram_collection_stats").upsert(
            {
                "id": 1,
                "channel_count": len(collected),
                "total_subscribers": sum(c.get("subscriber_count") or 0 for c in collected),
                "active_channels_7d": active_7d,
                "messages_7d": messages_7d,
                "total_mentions": total_mentions,
                "window_start": week_ago,
                "computed_for": today,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="id",
        ).execute()
        print(
            f"[수집량] 채널 {len(collected)} · 활성7일 {active_7d} · "
            f"메시지7일 {messages_7d:,} · 누적언급 {total_mentions:,} 저장(창 시작 {week_ago})"
        )
    except Exception as e:  # noqa: BLE001 — 표가 없을 때 스크립트를 죽이지 않는다
        print(f"[수집량] 저장 실패(무시하고 계속): {e}")


def main() -> None:
    db = get_client()
    # channel_id·access_hash 를 함께 받는다 — 아래 save_collection_stats 가 '실제로
    # 수집되는 채널'을 이 둘로 가른다(fetch_telegram.py 와 같은 기준). 영향력 점수는
    # 예전처럼 활성 채널 전부를 대상으로 하므로 이 select 확장이 점수를 바꾸지 않는다.
    #
    # load_all 로 바꾼 이유: 지금 317행이라 안 걸리지만, 1,000행을 넘으면 PostgREST 가
    # **에러 없이** 자른다. 그러면 점수가 빠질 뿐 아니라 여기서 센 '모니터링 채널' 수가
    # 조용히 작아져 화면에 그대로 나간다(레포에 같은 사고가 여러 번 있었다).
    all_channels = load_all(
        db, "telegram_channels", "id,handle,subscriber_count,channel_id,access_hash,is_active"
    )
    channels = [c for c in all_channels if c["is_active"]]
    if not channels:
        print("[경고] 활성 채널이 없습니다.")
        return

    today = today_kst().isoformat()
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    rows = []

    for ch in channels:
        handle = ch["handle"]
        sub = ch["subscriber_count"] or 0

        recent = (
            db.table("telegram_messages")
            .select("views,forwards")
            .eq("channel_handle", handle)
            .order("posted_at", desc=True)
            .limit(RECENT_POSTS)
            .execute()
            .data
        )
        weekly_posts = (
            db.table("telegram_messages")
            .select("id", count="exact")
            .eq("channel_handle", handle)
            .gte("posted_at", week_ago)
            .limit(1)
            .execute()
            .count
        ) or 0

        views = [m["views"] for m in recent if m["views"] is not None]
        avg_views = sum(views) / len(views) if views else 0.0
        view_rate = (avg_views / sub * 100) if sub else 0.0
        sum_views = sum(m["views"] or 0 for m in recent)
        sum_fwd = sum(m["forwards"] or 0 for m in recent)
        fwd_rate = (sum_fwd / sum_views * 100) if sum_views else 0.0

        raw = (
            tier_score(view_rate, VIEW_RATE_TIERS)
            + tier_score(fwd_rate, FWD_RATE_TIERS)
            + tier_score(sub, SUB_TIERS)
            + tier_score(weekly_posts, ACTIVITY_TIERS)
        )
        base = 48 + (raw / 100) * 52
        is_growing = view_rate < GROWING_VIEW_RATE
        influence = min(base * GROWING_PENALTY, GROWING_CAP) if is_growing else base

        rows.append(
            {
                "channel_handle": handle,
                "date": today,
                "subscriber_count": sub,
                "avg_views": round(avg_views, 1),
                "view_rate": round(view_rate, 2),
                "fwd_rate": round(fwd_rate, 3),
                "weekly_posts": weekly_posts,
                "influence_score": round(influence, 1),
                "is_growing": is_growing,
            }
        )

    db.table("telegram_channel_stats").upsert(
        rows, on_conflict="channel_handle,date"
    ).execute()

    # 화면의 '모니터링 채널'은 목록 크기가 아니라 **실제로 열리는 채널** 수다.
    # fetch_telegram.py 는 peer 캐시(channel_id·access_hash)가 둘 다 있는 채널만 열고
    # 나머지는 통째로 건너뛴다 — 그 기준을 그대로 쓴다.
    collected = [
        c for c in channels if c.get("channel_id") is not None and c.get("access_hash") is not None
    ]
    collected_handles = {c["handle"] for c in collected}
    # '활성 채널 7일' = 그중 방금 계산한 weekly_posts 가 0보다 큰 것. rows 는 이 실행에서
    # 만든 것이라 저장 전에 그대로 셀 수 있다(화면이 읽던 값과 같은 출처다).
    active_7d = sum(
        1
        for r in rows
        if (r["weekly_posts"] or 0) > 0 and r["channel_handle"] in collected_handles
    )
    save_collection_stats(db, today, week_ago, collected, active_7d)

    rows.sort(key=lambda r: r["influence_score"], reverse=True)
    print(f"=== Influence Score {today} (저장 완료, {len(rows)}건) ===")
    print(f"{'#':>2} {'채널':<16}{'구독':>9}{'뷰레이트':>8}{'Score':>7}  등급")
    for i, r in enumerate(rows, 1):
        grade = "성장중" if r["is_growing"] else "일반"
        print(
            f"{i:>2} {r['channel_handle']:<16}{r['subscriber_count']:>9,}"
            f"{r['view_rate']:>7.1f}%{r['influence_score']:>7.1f}  {grade}"
        )


if __name__ == "__main__":
    main()
