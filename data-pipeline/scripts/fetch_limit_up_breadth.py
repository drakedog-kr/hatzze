"""코스피 전종목의 장중 급등 종목 수를 가중 합산해 froth 지표로 저장.

원값 = 3×상한가 터치 + 2×(+20~29%) + 1×(+10~20%)

**세 칸은 겹치지 않는다.** 상한가 ⊂ +20 ⊂ +10 이라 그냥 세면 상한가 종목이 세 번
세어져 가중치가 의도대로 안 먹는다.

**종가가 아니라 장중 고가로 잰다.** KRX 가 주는 등락률(FLUC_RT)은 종가 기준이라,
상한가를 찍었다가 풀려서 +26% 로 마감한 종목을 통째로 놓친다(2026-07-30 실측:
장중 터치 18 중 9가 풀렸고, 그중엔 −22.75% 로 마감한 것도 있었다). 전일 종가를
`TDD_CLSPRC − CMPPREVDD_PRC` 로 복원해 `TDD_HGPRC` 로 다시 잰다.

**상한가 판정은 위도 막는다**(29.0~30.5%). 30.5 를 넘는 건 가격제한폭이 없는
종목(정리매매·신규상장 첫날)이라 상한가가 아니다.

## 눈금과 한계

기준선은 고정값이 아니라 **최근 1년(252거래일) 평균**이다(indicator_thresholds 의
kind="rolling_average"). 상장 종목 수가 2021년 2,300개대에서 2,700개대로 늘었는데,
개수를 고정 임계값에 걸면 그 증가만으로 과열도가 올라간다. 기준선이 같이 움직이면
그 문제가 사라진다.

⚠️ **이 지표는 과열보다 변동성에 가깝다.** 2021-01 개인 광풍 대비 2026 폭락 구간에서
더 크게 나온다(실측: 폭락 중앙 90.6 vs 강세 45.4). 급등 종목 수는 시장이 어느 쪽으로든
크게 흔들릴 때 함께 늘기 때문이다. 상승−하락 상쇄·고점권 게이트·유지율 등 10가지
형태를 1,366거래일로 시험했지만 광풍과 폭락을 가르는 조합은 찾지 못했다(전수 탐색에서
46,225개 중 21%가 '분리'에 성공했는데, 그 통과율 자체가 신호가 아니라는 증거다).
그래서 **가중치를 1.0 으로 낮춰** 들여놓는다 — 값이 틀려도 종합 점수는 1점 안쪽으로
움직인다. 판별력이 확인되면 그때 올린다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_limit_up_breadth.py             # 최근 구간 갱신
    python scripts/fetch_limit_up_breadth.py --backfill  # 2021년부터 백필
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.indicator import ensure_indicator  # noqa: E402
from common.krx_client import krx_get  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

# 코스피만 본다. 상한가는 코스닥에서 훨씬 많이 나와서(같은 날 기준 3배쯤) 둘을 합치면
# 지표가 사실상 코스닥 지표가 된다. 이 사이트의 과열도는 코스피 시장을 말하므로 시장을
# 맞춘다. 코스닥 쏠림은 kosdaq_kospi_ratio 가 따로 본다.
KRX_URLS = ("http://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd",)
# 원값 가중치. 처음엔 손으로 정한다 — 데이터로 고르려 했지만 어떤 조합도 국면을 못 갈랐다.
W_LIMIT, W_20, W_10 = 3, 2, 1
LIMIT_LO, LIMIT_HI = 29.0, 30.5  # 상한가 판정 구간(호가 절사로 29.x~30.0 에 찍힌다)
BACKFILL_DAYS = 2000  # 달력일. 2021년 초까지 닿는다
RECENT_DAYS = 10  # 평소 실행에서 다시 계산하는 최근 구간(KRX 지연을 덮는다)
NAMES_PER_BUCKET = 10  # 툴팁에 적을 종목 수(거래대금 상위). 나머지는 "외 N개"로 센다
REQUEST_DELAY_SEC = 0.05

INDICATOR_SLUG = "limit_up_breadth"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "급등 종목 강도",
    "category": "시장",
    "headline": "코스피에서 장중 크게 오른 종목이 얼마나 쏟아졌나",
    "description_beginner": (
        "코스피에서 상한가에 가까이 간 종목이 많을수록, 개별 종목에 돈이 몰려 들끓는 장이라는 신호입니다"
    ),
    "unit": "점",
}


def _to_f(v) -> float:
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def collect_day(d: date) -> dict | None:
    """하루치 (원값, details). 휴장이거나 KRX 에 아직 없으면 None."""
    rows: list[dict] = []
    for url in KRX_URLS:
        resp = krx_get(url, d.strftime("%Y%m%d"))
        if resp is None:
            continue
        if resp.status_code == 401:
            raise PermissionError(
                f"KRX {url} 가 401. data.krx.co.kr 에서 해당 일별매매정보 Open API "
                "이용신청·승인을 확인하세요."
            )
        if resp.status_code != 200:
            continue
        rows += resp.json().get("OutBlock_1", [])
        time.sleep(REQUEST_DELAY_SEC)
    if not rows:
        return None

    # (거래대금, 종목명) — 툴팁에 적을 대표 종목을 거래대금 순으로 고른다.
    buckets: dict[str, list[tuple[float, str]]] = {"limit": [], "up20": [], "up10": []}
    for x in rows:
        close = _to_f(x.get("TDD_CLSPRC"))
        prev = close - _to_f(x.get("CMPPREVDD_PRC"))
        if prev <= 0:
            continue
        hi = (_to_f(x.get("TDD_HGPRC")) / prev - 1) * 100
        item = (_to_f(x.get("ACC_TRDVAL")), (x.get("ISU_NM") or "").strip())
        if LIMIT_LO <= hi <= LIMIT_HI:
            buckets["limit"].append(item)
        elif 20.0 <= hi < LIMIT_LO:
            buckets["up20"].append(item)
        elif 10.0 <= hi < 20.0:
            buckets["up10"].append(item)

    counts = {k: len(v) for k, v in buckets.items()}
    raw = W_LIMIT * counts["limit"] + W_20 * counts["up20"] + W_10 * counts["up10"]

    details: dict = {
        "limit_n": counts["limit"],
        "up20_n": counts["up20"],
        "up10_n": counts["up10"],
        "listed_n": len(rows),
    }
    for key, items in buckets.items():
        items.sort(key=lambda t: -t[0])
        details[f"{key}_names"] = [nm for _, nm in items[:NAMES_PER_BUCKET] if nm]
    return {"raw": float(raw), "details": details}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="2021년까지 채운다")
    args = ap.parse_args()

    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    span = BACKFILL_DAYS if args.backfill else RECENT_DAYS
    today = date.today()
    saved = 0
    last: tuple[str, dict] | None = None
    for i in range(span):
        d = today - timedelta(days=i)
        if d.weekday() >= 5:  # 주말은 호출조차 하지 않는다
            continue
        got = collect_day(d)
        if not got:
            continue
        iso = d.isoformat()
        client.table("indicator_values").upsert(
            {
                "indicator_id": indicator_id,
                "date": iso,
                "raw_value": got["raw"],
                "details": got["details"],
            },
            on_conflict="indicator_id,date",
        ).execute()
        saved += 1
        if last is None:
            last = (iso, got)
        if args.backfill and saved % 100 == 0:
            print(f"[진행] {iso} 까지 {saved}거래일", flush=True)

    if last is None:
        print("[WARNING] 저장할 거래일이 없습니다(KRX 지연이거나 연휴).")
        return
    iso, got = last
    dt = got["details"]
    print(
        f"[Supabase] {saved}거래일 upsert. 최신 {iso} → 원값 {got['raw']:.0f}점 "
        f"(상한가 {dt['limit_n']} · +20~29% {dt['up20_n']} · +10~20% {dt['up10_n']})"
    )


if __name__ == "__main__":
    main()
