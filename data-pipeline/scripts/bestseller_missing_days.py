"""경제 베스트셀러 비중 행이 오늘(KST)까지 며칠 연속 비었나 — 그 일수 하나만 표준 출력에 찍는다(읽기만 한다).

    python data-pipeline/scripts/bestseller_missing_days.py   # 0 = 오늘 행 있음 · 1 = 오늘만 빔 · 3 = 그제부터 빔

알라딘 API 가 가끔 403 을 낸다. 2026-09 ~ 10월에 이 스크립트 하나로 파이프라인 알림 이슈가 열 번 남짓 열렸는데 전부 다음
실행에서 돌아왔고, 행이 하루 넘게 빈 날은 09-14 하루뿐이었다. 그래서 daily-update.yml 의 Summarize results 는 이 일수가
3 이상일 때만 베스트셀러 실패를 알림에 센다(2026-10-25 #793). 저녁 실행만 실패한 날은 아침 행이 있어 0 이다.

알라딘은 '오늘' 순위만 준다(fetch_bestseller_ratio 머리말). 그래서 행이 빈 날 = 그날 실행이 다 실패한 날이다.
⚠️ 못 읽으면 아무것도 안 찍고 1 로 끝난다 — 워크플로는 빈 값을 '알린다'로 읽는다. 알림을 놓치는 쪽보다 한 번 더 울리는 쪽이 낫다.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common.supabase_client import get_client  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

SLUG = "bestseller_finance_ratio"
NO_ROW_DAYS = 9999  # 행이 하나도 없으면 — check_freshness 의 lag 와 같은 값


def missing_days(latest: str | None, today: date) -> int:
    """마지막 행 날짜부터 오늘까지 행이 빈 날 수. 오늘 행이 있으면 0, 어제가 마지막이면 1."""
    if latest is None:
        return NO_ROW_DAYS
    return max(0, (today - date.fromisoformat(latest)).days)


def latest_row_date(db) -> str | None:
    ind = db.table("indicators").select("id").eq("slug", SLUG).limit(1).execute().data
    if not ind:
        return None
    rows = (
        db.table("indicator_values")
        .select("date")
        .eq("indicator_id", ind[0]["id"])
        .order("date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["date"] if rows else None


def main() -> int:
    try:
        latest = latest_row_date(get_client())
    except Exception as e:  # noqa: BLE001
        print(f"[베스트셀러] 못 읽어 알리는 쪽으로 둡니다: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    n = missing_days(latest, today_kst())
    print(f"[베스트셀러] 마지막 행 {latest} · 오늘까지 빈 날 {n}일", file=sys.stderr)
    print(n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
