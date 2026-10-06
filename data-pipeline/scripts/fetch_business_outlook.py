"""기업들이 내다본 다음 달 경기가 1년 전보다 얼마나 밝은가를 froth 지표로 저장 — '기업 체감 경기'.

원값 = 이번 업황전망 BSI − 1년 전 같은 달 업황전망 BSI  (단위 p)

## 원천 — 한국은행 기업경기조사(전망) · ECOS 512Y014 · 전산업(99988) · 업황전망BSI(BA)

한국은행이 매달 법인기업 3천여 곳에 묻는 설문이다. 매달 말에 '이번 달 실적'과 '다음 달 전망'을 같이 내는데,
ECOS 는 전망을 **전망하는 달**로 적는다 — 2026-09 조사(09-25 무렵 공표)가 시점 202610 이다. 그래서 공표 지연이
없다(그달이 오기 전에 이미 나와 있다). 키는 버핏지수·CCSI 와 같은 ECOS_API_KEY.

행 날짜는 **조사한 달 1일**로 적는다(202610 전망 → 2026-09-01). CCSI 와 같은 규칙이고, 전망하는 달로 적으면
월말 며칠 동안 미래 날짜 행이 생긴다. 전망하는 달은 details.month 에 남긴다. ⚠️ 조사한 달 1일엔 아직 공표 전이다
(25일 무렵에 나온다) — 지난 점수를 이 행 날짜로 다시 계산하면 3주쯤 미리 본 셈이 된다.

## 왜 '1년 전 같은 달'과 견주나

업황 BSI 는 계절조정을 안 한 값이라 달마다 버릇이 있다(2010~ '1년 중앙값 대비' 달별 평균 1월 −3.0 · 2월 −2.0 ·
5월 +1.9). 1년 중앙값과 견주면 해마다 1월에 식고 5월에 데워진다. 같은 달끼리 견주면 계절이 빠진다.

## 잰 것(2026-10-06)

2016~2026 고점 6·바닥 8 에서 '고점 값 > 바닥 값' 확률 0.74, 큰 바닥만 0.83. 같은 계열을 시간축으로 통째로 밀어 둔
가짜 249개 중 95% 가 0.71 이하라 우연보다는 낫지만 약한 편이다. 코스피 '1년 중앙 대비'와 상관 0.32 · 60일 수익률과
0.08 — 가격을 거의 따라 하지 않는다. ⚠️ 2026 강세장 중간의 눌림 바닥(03-31 +9 · 07-30 +7)에서도 높았다. 기업 전망은
몇 달에 걸쳐 천천히 움직여서 한 달 안쪽의 눌림을 못 가린다. 가중치를 낮게 둔 이유다(indicator_weights.py).

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_business_outlook.py                       # 전 기록을 다시 계산해 upsert
    python scripts/fetch_business_outlook.py --preview <파일.json>  # DB 를 안 건드리고 미리보기 JSON 만
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import ECOS_API_KEY  # noqa: E402
from common.ecos_client import EcosUnavailableError, statistic_search  # noqa: E402
from common.indicator import ensure_indicator, upsert_merged, write_preview  # noqa: E402
from common.timeutil import today_kst  # noqa: E402

ECOS_STAT_CODE = "512Y014"  # 기업경기조사(전망)
ECOS_ITEM = "99988/BA"  # 전산업 / 업황전망BSI
ECOS_START = "200302"  # 기록 첫 달
# 이 아래로 오면 저쪽이 잘린 응답을 준 것이다(2026-10 기준 285개월). 그대로 저장하면 전 기록이 짧은 자료로 덮인다.
MIN_MONTHS = 200
# 1년 전 같은 달.
LAG_MONTHS = 12
# 카드의 1년 차트 — 최근 12개월(전망하는 달). 최신 행의 details 에만 싣는다.
SERIES_MONTHS = 12
SERIES_KEYS = ("w_months", "w_bsi", "w_prev")

INDICATOR_SLUG = "business_outlook"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "기업 체감 경기",
    "category": "감성",
    "headline": "기업들이 내다본 다음 달 경기",
    "description_beginner": "기업 전망이 1년 전보다 밝아지면 과열 신호입니다",
    "unit": "p",
}


def month_add(ym: str, n: int) -> str:
    """'YYYY-MM' 에 n 달을 더한다(음수면 뺀다)."""
    y, m = int(ym[:4]), int(ym[5:7])
    k = y * 12 + (m - 1) + n
    return f"{k // 12:04d}-{k % 12 + 1:02d}"


def fetch_all() -> list[tuple[str, float]]:
    """(전망하는 달 'YYYY-MM', 업황전망 BSI) 를 달 오름차순으로 돌려준다."""
    # 끝은 다음 달까지 — 월말엔 다음 달 전망이 이미 나와 있다.
    end = month_add(today_kst().strftime("%Y-%m"), 1).replace("-", "")
    rows = statistic_search(ECOS_STAT_CODE, "M", ECOS_START, end, ECOS_ITEM, count=1000)
    return [(f"{r['TIME'][:4]}-{r['TIME'][4:6]}", float(r["DATA_VALUE"])) for r in rows]


def build_rows(series: list[tuple[str, float]]) -> list[dict]:
    """달마다 1년 전 같은 달과 견준 값을 만든다. 1년 전 값이 없는 달은 건너뛴다.

    행 날짜는 조사한 달 1일이다(머리말). 마지막 행의 details 에는 카드 차트용 12개월 점(SERIES_KEYS)을 더 싣는다.
    """
    by_month = dict(series)
    rows = []
    for ym, v in series:
        prev = by_month.get(month_add(ym, -LAG_MONTHS))
        if prev is None:
            continue
        rows.append(
            {
                "date": f"{month_add(ym, -1)}-01",
                "raw_value": round(v - prev, 1),
                "details": {"month": ym, "bsi": v, "prev": prev},
            }
        )
    if rows:
        picked = rows[-SERIES_MONTHS:]
        rows[-1]["details"].update(
            {
                "w_months": [r["details"]["month"] for r in picked],
                "w_bsi": [r["details"]["bsi"] for r in picked],
                "w_prev": [r["details"]["prev"] for r in picked],
            }
        )
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", metavar="PATH", help="DB 를 안 건드리고 dev 오버레이용 JSON 만 쓴다")
    args = ap.parse_args()

    if not ECOS_API_KEY:
        print("[기업 체감 경기] ECOS_API_KEY 없음 — 건너뜁니다")
        return

    client = indicator_id = None
    if not args.preview:
        from common.supabase_client import get_client

        # 지표 행을 **먼저** 만든다. ECOS 가 막힌 날에도 행은 있어야 calculate_score 가
        # "지표가 없다"로 통째로 멈추지 않는다.
        client = get_client()
        indicator_id = ensure_indicator(client, INDICATOR_META)
        print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    try:
        series = fetch_all()
    except EcosUnavailableError as e:
        # 해외 러너에서 ECOS 가 가끔 통째로 막힌다(fetch_consumer_sentiment 머리말). 한 달에 한 번 바뀌는 값이라
        # 하루 못 받아도 낡지 않는다. 오래 멈추면 check_freshness 가 잡는다.
        print(f"[WARNING] {e}")
        print("[WARNING] ECOS 접속 문제로 오늘 갱신을 건너뜁니다. 월 1회 공표라 기존 값이 그대로 쓰입니다.")
        return

    if len(series) < MIN_MONTHS:
        raise RuntimeError(f"업황전망이 {len(series)}개월치뿐입니다(하한 {MIN_MONTHS}) — 잘린 응답으로 보고 저장하지 않습니다")
    rows = build_rows(series)
    last = rows[-1]["details"]
    print(
        f"[ECOS] 업황전망 {len(series)}개월치({series[0][0]}~{series[-1][0]}) → {len(rows)}개월 계산. "
        f"최신 {last['month']} 전망 {last['bsi']:g} · 1년 전 {last['prev']:g} · {rows[-1]['raw_value']:+.1f}p"
    )
    # 이번 달 전망은 지난달 말에 나온다. 그것도 없으면 공표가 멈춘 것이다.
    if series[-1][0] < today_kst().strftime("%Y-%m"):
        print(f"[WARNING] 최신 전망이 {series[-1][0]} 입니다 — 공표가 멈췄는지 볼 것")

    if args.preview:
        write_preview(INDICATOR_META, rows, args.preview)
        return

    # 전 기록을 다시 쓴다(공식을 고치면 지난 달도 같이 맞도록). details 는 병합한다(common/indicator.upsert_merged 머리말).
    n = upsert_merged(client, indicator_id, rows, SERIES_KEYS)
    print(f"[Supabase] {n}개월 upsert 완료")


if __name__ == "__main__":
    main()
