"""신용융자 잔고가 한 달(20영업일) 새 얼마나 불었나를 froth 지표로 저장 — '빚투 속도'.

원값 = (그날 신용거래융자 잔고 ÷ 20영업일 전 잔고 − 1) × 100  (단위 %)

신용거래융자는 증권사에서 빌린 돈으로 주식을 사고, 산 주식이 담보가 되는 대출이다 — 빌린 돈이 곧 주식
매수에 쓰이니 '빚내서 투자'와 뜻이 맞는다. 예탁증권 담보융자(계좌 주식을 맡기고 현금을 빌림)는 쓰임새가
정해져 있지 않아 넣지 않는다(실측도 담보융자만 0.67 · 신용만 0.85 · 합 0.88 이라 더해 얻는 게 잡음 수준).

## 원천 — 금투협 '신용공여 잔고 추이'(getGrantingOfCreditBalanceInfo · crdTrFingWhl = 유가증권+코스닥)

받는 법·이용 조건은 common/kofia.py 머리말에 있다. 기록은 2021-11-09 부터라 2021-12 무렵부터 값이 나온다.
⚠️ 신용공여는 **결제일 기준**이다(FreeSIS 유의사항). 실제 거래보다 이틀쯤 늦고, 다음 영업일에 나온다.

## 왜 '잔고'가 아니라 '한 달 새 얼마나'인가

잔고는 시장 규모를 따라 커져(2026-09 33조 안팎) 고정 눈금이 금방 낡고, 시가총액으로 나누면 2025~26 강세장에서
시총이 더 빨리 불어 고점에서 오히려 바닥권이었다. 한 달 증가율은 2016~2026 금투협 일별(고점 6·바닥 8)에서
'고점 값 > 바닥 값' 확률 0.85, 큰 바닥만 보면 1.00 이고 고점 6번 모두 플러스였다. 폭락장에선 반대매매·상환으로
크게 줄어든다(2020-03 최저 −38.5% · 2026-07~08 −27.4%).

⚠️ 강세장 중간의 눌림(2025-11-24)에서는 +10% 로 높았다 — 잔고가 아직 불어나던 때다. 폭락 뒤 되감김
(2020-04~05 · 2026-09)도 높게 읽힌다. 게이트를 시험한 결과는 indicator_thresholds.py 쪽에 있다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_credit_loan.py                       # 전 기록을 다시 계산해 upsert
    python scripts/fetch_credit_loan.py --preview <파일.json>  # DB 를 안 건드리고 미리보기 JSON 만
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import KSD_API_KEY  # noqa: E402
from common.indicator import ensure_indicator, upsert_merged, write_preview  # noqa: E402
from common.kofia import KofiaUnavailableError, fetch_daily  # noqa: E402

# 이 아래로 오면 저쪽이 잘린 응답을 준 것이다. 그대로 저장하면 전 기록이 짧은 자료로 다시 덮이므로 저장하지 않는다.
MIN_ROWS = 1000
# 한 달 = 20영업일.
LAG_DAYS = 20
# 카드의 1년 차트 — 최근 250영업일을 5영업일 간격으로 고른 점(약 50개). 최신 행의 details 에만 싣는다.
SERIES_DAYS = 250
SERIES_STEP = 5
SERIES_KEYS = ("w_dates", "w_loan", "w_prev")

INDICATOR_SLUG = "credit_loan_growth"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "신용융자 잔고",
    "category": "시장",
    "headline": "빚내서 주식을 산 금액",
    "description_beginner": "빚내서 주식 사는 돈이 불어나면 과열 신호입니다",
    "unit": "%",
}


def fetch_all() -> list[tuple[str, float]]:
    """(YYYY-MM-DD, 신용거래융자 잔고 원 · 유가증권+코스닥) 을 날짜 오름차순으로 돌려준다."""
    return fetch_daily("getGrantingOfCreditBalanceInfo", "crdTrFingWhl", "금투협 신용공여")


def build_rows(series: list[tuple[str, float]]) -> list[dict]:
    """날짜마다 LAG_DAYS 영업일 전 잔고와 견준 값을 만든다. 그만큼 앞이 없는 날은 건너뛴다.

    마지막 행의 details 에는 카드 차트용 1년치 점(SERIES_KEYS)을 더 싣는다 — 잔고(w_loan)와 그 점의 한 달 전
    잔고(w_prev). 두 선이 벌어진 만큼이 그날의 원값이다.
    """
    rows = []
    for i in range(LAG_DAYS, len(series)):
        d, v = series[i]
        prev = series[i - LAG_DAYS][1]
        rows.append(
            {
                "date": d,
                "raw_value": round((v / prev - 1) * 100, 1),
                "details": {"loan_jo": round(v / 1e12, 1), "prev_jo": round(prev / 1e12, 1)},
            }
        )
    if rows:
        # 끝에서부터 SERIES_STEP 간격으로 고른다 — 그래야 최신 날이 반드시 차트의 끝점이 된다.
        picked = rows[::-1][: SERIES_DAYS : SERIES_STEP][::-1]
        rows[-1]["details"].update(
            {
                "w_dates": [r["date"] for r in picked],
                "w_loan": [r["details"]["loan_jo"] for r in picked],
                "w_prev": [r["details"]["prev_jo"] for r in picked],
            }
        )
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", metavar="PATH", help="DB 를 안 건드리고 dev 오버레이용 JSON 만 쓴다")
    args = ap.parse_args()

    if not KSD_API_KEY:
        print("[신용융자] KSD_API_KEY 없음 — 건너뜁니다")
        return

    client = indicator_id = None
    if not args.preview:
        from common.supabase_client import get_client

        # 지표 행을 **먼저** 만든다. API 가 죽은 날에도 행은 있어야 calculate_score 가
        # "지표가 없다"로 통째로 멈추지 않고 '값 없음'으로 이 지표만 뺀다.
        client = get_client()
        indicator_id = ensure_indicator(client, INDICATOR_META)
        print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    try:
        series = fetch_all()
    except KofiaUnavailableError as e:
        # 해외 러너에서 금투협 API 가 가끔 통째로 막힌다(common/kofia.KofiaUnavailableError). 전 기록을 매번 다시 받으므로
        # 다음 실행이 메운다 — 실패로 끝내지 않는다. 오래 멈추면 check_freshness 가 잡는다.
        print(f"[WARNING] {e}")
        print("[WARNING] 금투협 API 에 닿지 못해 오늘 신용융자 갱신을 건너뜁니다. 다음 실행이 전 기록을 다시 받습니다.")
        return
    if len(series) < MIN_ROWS:
        raise RuntimeError(f"신용융자가 {len(series)}일치뿐입니다(하한 {MIN_ROWS}) — 잘린 응답으로 보고 저장하지 않습니다")
    rows = build_rows(series)
    last = rows[-1]
    print(
        f"[금투협] 신용융자 {len(series)}일치({series[0][0]}~{series[-1][0]}) → {len(rows)}일 계산. "
        f"최신 {last['date']} {last['details']['loan_jo']}조 · 한 달 전 {last['details']['prev_jo']}조 · "
        f"{last['raw_value']:+.1f}%"
    )
    if (date.today() - date.fromisoformat(series[-1][0])).days > 7:
        print(f"[WARNING] 최신 자료일이 {series[-1][0]} 입니다 — 공표가 멈췄는지 볼 것")

    if args.preview:
        write_preview(INDICATOR_META, rows, args.preview)
        return

    # 전 기록을 다시 쓴다(공식을 고치면 지난 날도 같이 맞도록). details 는 병합한다(common/indicator.upsert_merged 머리말).
    n = upsert_merged(client, indicator_id, rows, SERIES_KEYS)
    print(f"[Supabase] {n}일 upsert 완료")


if __name__ == "__main__":
    main()
