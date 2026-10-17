"""국장 등락 이유에 **아직 KRX 등락률이 비어 있는 어제 줄**이 있나 — 있으면 0, 없으면 1 로 끝난다(읽기만 한다).

    python data-pipeline/scripts/move_reason_rates_pending.py && echo 기다린다

아침 국장 카더라 · 국장 테마 상세는 '등락 이유' 칸의 어제 등락률 · 종가를 KRX 확정값으로 그린다. 그 값은 08:00 공표 뒤 배당 잡의
'등락 이유 등락률 채우기'(generate_move_reasons.py --fill-only)가 넣는다. 채울 줄이 있으면 그 스텝을 기다렸다 화면을 비우고(안 그러면
그 칸만 나중에 바뀐다), **없으면 기다리지 않는다** — 일요일 · 월요일 · 휴장 다음 날은 어제 줄이 없거나 이미 채워져 있어, 기다리면
화면만 08:00 까지 늦고 '업데이트' 라벨(총평 시각)과 어긋난다(daily-update.yml 의 아침 국장 카더라 비우기 · 2026-10-18).

'어제 줄' = 오늘(KST)보다 앞선 가장 최근 날짜의 줄. 그 날짜에 change_rate 가 빈 줄이 하나라도 있으면 채울 것이 있다.
⚠️ 못 읽으면 0(기다린다)으로 끝낸다 — 등락률 없이 먼저 비우는 것보다 늦게 비우는 편이 안전하다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common.supabase_client import get_client  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

TABLE = "telegram_stock_move_reason"


def pending(db) -> bool:
    today = today_kst().isoformat()
    last = db.table(TABLE).select("date").lt("date", today).order("date", desc=True).limit(1).execute().data
    if not last:
        return False
    day = last[0]["date"]
    empty = db.table(TABLE).select("stock_code").eq("date", day).is_("change_rate", "null").limit(1).execute().data
    print(f"[등락률] 어제 줄({day}) 중 KRX 등락률이 빈 줄 {'있음 — 채우기를 기다린다' if empty else '없음 — 기다리지 않는다'}")
    return bool(empty)


def main() -> int:
    try:
        return 0 if pending(get_client()) else 1
    except Exception as e:  # noqa: BLE001
        print(f"[등락률] 못 읽어 기다리는 쪽으로 둡니다: {type(e).__name__}: {e}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
