"""투자자예탁금이 최근 1년 평소보다 얼마나 불었나를 froth 지표로 저장.

원값 = (그날 예탁금 ÷ 직전 250영업일 예탁금의 중앙값 − 1) × 100  (단위 %)

투자자예탁금은 주식을 사려고 증권계좌에 넣어 둔 돈이다(장내파생상품 거래예수금 제외). 개인
투자자가 몰려드는 국면에 불고, 돈이 빠져나가는 폭락장에서 준다.

## 원천 — 금투협 '증시자금추이'(getSecuritiesMarketTotalCapitalInfo · invrDpsgAmt)

받는 법·이용 조건·대조 결과는 common/kofia.py 머리말에 있다. 기록은 2021-10-26 부터라, 1년 기준선이
차는 2022-10 무렵부터 값이 나온다.

예탁금을 예전에 네이버 금융에서 긁어 쓰다가 2026-07-31 에 내렸다(finance.naver.com 의
robots.txt 가 전면 금지). 원천이 공식 API 로 바뀌어 되살린 것이다.

## 왜 '1년 평소 대비'인가

예탁금은 시장 규모를 따라 우상향한다(2022-11 49.7조 → 2026-09 104.7조). 금액에 고정 눈금을
걸면 금방 낡는다. 그래서 직전 1년 중앙값과 견준다.
- **평균이 아니라 중앙값**: 광풍 몇 주가 평균을 끌어올리면 그다음 1년이 통째로 눌린다.
- **오늘은 기준선에서 뺀다**: 넣으면 불어난 날이 제 기준선을 스스로 올린다.
- 2016~2026 실측(금투협 일별, 고점 6·바닥 8)에서 '고점 값 > 바닥 값' 확률 0.79, 큰 바닥만
  보면 0.92 다. 2022 이후 공식 API 자료만으로는 0.89.

⚠️ 강세장 중간의 눌림(2025-11-24 +39.4% · 2026-03-31 +48.7%)에서는 값이 고점만큼 높다. 1년
기준선이 오르는 속도보다 예탁금이 빨리 불어서다. 큰 바닥에서는 낮다(2022-09-30 −18.8% ·
2026-07-30 +9.4%). 2020-03 코로나 바닥만 예외로 +51.6% 였다 — 그때 개인이 바닥에서 몰려들었다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_investor_deposit.py                       # 전 기록을 다시 계산해 upsert
    python scripts/fetch_investor_deposit.py --preview <파일.json>  # DB 를 안 건드리고 미리보기 JSON 만
"""

from __future__ import annotations

import argparse
import statistics
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import KSD_API_KEY  # noqa: E402
from common.indicator import ensure_indicator, upsert_merged, write_preview  # noqa: E402
from common.kofia import KofiaUnavailableError, fetch_daily  # noqa: E402

# 이 아래로 오면 저쪽이 잘린 응답을 준 것이다. 그대로 저장하면 1년 기준선이 짧아진 채로
# 전 기록이 다시 계산돼 덮이므로 저장하지 않는다.
MIN_ROWS = 1000
# 기준선 길이(영업일). 약 1년.
BASELINE_DAYS = 250
# 카드의 1년 차트 — 최근 250영업일을 5영업일 간격으로 고른 점(약 50개). 최신 행의 details 에만 싣는다.
# 매일 다 싣으면 30행을 읽는 화면 조회가 그만큼 무거워지고, 지난 행의 차트는 아무도 안 본다.
SERIES_DAYS = 250
SERIES_STEP = 5
SERIES_KEYS = ("w_dates", "w_dep", "w_med")

INDICATOR_SLUG = "investor_deposit"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "투자자예탁금",
    "category": "시장",
    "headline": "주식 계좌에 넣어 둔 돈",
    "description_beginner": "계좌에 넣어 둔 돈이 불어나면 과열 신호입니다",
    "unit": "%",
}


def fetch_all() -> list[tuple[str, float]]:
    """(YYYY-MM-DD, 투자자예탁금 원) 을 날짜 오름차순으로 돌려준다."""
    return fetch_daily("getSecuritiesMarketTotalCapitalInfo", "invrDpsgAmt", "금투협 증시자금")


def build_rows(series: list[tuple[str, float]]) -> list[dict]:
    """날짜마다 직전 BASELINE_DAYS 영업일 중앙값과 견준 값을 만든다. 기준선이 덜 찬 날은 건너뛴다.

    마지막 행의 details 에는 카드 차트용 1년치 점(SERIES_KEYS)을 더 싣는다.
    """
    rows = []
    for i in range(BASELINE_DAYS, len(series)):
        d, v = series[i]
        median = statistics.median(x for _, x in series[i - BASELINE_DAYS : i])
        rows.append(
            {
                "date": d,
                "raw_value": round((v / median - 1) * 100, 1),
                # 카드의 막대 두 줄(1년 평소 · 최근). 조원.
                "details": {"deposit_jo": round(v / 1e12, 1), "median_jo": round(median / 1e12, 1)},
            }
        )
    if rows:
        # 끝에서부터 SERIES_STEP 간격으로 고른다 — 그래야 최신 날이 반드시 차트의 끝점이 된다.
        picked = rows[::-1][: SERIES_DAYS : SERIES_STEP][::-1]
        rows[-1]["details"].update(
            {
                "w_dates": [r["date"] for r in picked],
                "w_dep": [r["details"]["deposit_jo"] for r in picked],
                "w_med": [r["details"]["median_jo"] for r in picked],
            }
        )
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", metavar="PATH", help="DB 를 안 건드리고 dev 오버레이용 JSON 만 쓴다")
    args = ap.parse_args()

    if not KSD_API_KEY:
        print("[투자자예탁금] KSD_API_KEY 없음 — 건너뜁니다")
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
        print("[WARNING] 금투협 API 에 닿지 못해 오늘 투자자예탁금 갱신을 건너뜁니다. 다음 실행이 전 기록을 다시 받습니다.")
        return
    if len(series) < MIN_ROWS:
        raise RuntimeError(f"예탁금이 {len(series)}일치뿐입니다(하한 {MIN_ROWS}) — 잘린 응답으로 보고 저장하지 않습니다")
    rows = build_rows(series)
    last = rows[-1]
    print(
        f"[금투협] 예탁금 {len(series)}일치({series[0][0]}~{series[-1][0]}) → {len(rows)}일 계산. "
        f"최신 {last['date']} {last['details']['deposit_jo']}조 · 1년 평소 {last['details']['median_jo']}조 · "
        f"{last['raw_value']:+.1f}%"
    )
    if (date.today() - date.fromisoformat(series[-1][0])).days > 7:
        print(f"[WARNING] 최신 자료일이 {series[-1][0]} 입니다 — 공표가 멈췄는지 볼 것")

    if args.preview:
        write_preview(INDICATOR_META, rows, args.preview)
        return

    # 전 기록을 다시 쓴다. 기준선이 날마다 움직이는 파생값이라(fetch_upbit_speculation 과 같은 이유)
    # 지난 날도 지금 공식으로 맞춰 둔다. details 는 병합한다(common/indicator.upsert_merged 머리말).
    n = upsert_merged(client, indicator_id, rows, SERIES_KEYS)
    print(f"[Supabase] {n}일 upsert 완료")


if __name__ == "__main__":
    main()
