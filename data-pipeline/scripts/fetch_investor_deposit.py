"""투자자예탁금이 최근 1년 평소보다 얼마나 불었나를 froth 지표로 저장.

원값 = (그날 예탁금 ÷ 직전 250영업일 예탁금의 중앙값 − 1) × 100  (단위 %)

투자자예탁금은 주식을 사려고 증권계좌에 넣어 둔 돈이다(장내파생상품 거래예수금 제외). 개인
투자자가 몰려드는 국면에 불고, 돈이 빠져나가는 폭락장에서 준다.

## 원천 — 공공데이터포털 '금융위원회_금융투자협회종합통계정보'

    https://apis.data.go.kr/1160100/service/GetKofiaStatisticsInfoService/getSecuritiesMarketTotalCapitalInfo

금융투자협회 FreeSIS 의 '증시자금추이'와 같은 값이다(2021-10~2026-09 의 1,209일 중 1,184일이
원 단위까지 같고, 나머지 25일도 1.1% 안쪽이다. 나중에 고친 값이 한쪽에만 들어간 것으로 보인다).
이용허락범위 제한 없음 · 자동승인 · 하루 1만 회. 키는 공공데이터포털 계정 키(KSD_API_KEY)를
같이 쓰고, 이 서비스에 활용신청이 돼 있어야 한다(안 돼 있으면 403 "등록되지 않은 서비스키").

날짜를 안 주고 numOfRows 를 넉넉히 주면 **한 번에 전 기록이 온다**(2026-10-06 실측 1,209행).
기록은 2021-10-26 부터라, 1년 기준선이 차는 2022-10 무렵부터 값이 나온다.

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
import json
import statistics
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import KSD_API_KEY  # noqa: E402
from common.http_client import get_with_retry  # noqa: E402

ENDPOINT = (
    "https://apis.data.go.kr/1160100/service/GetKofiaStatisticsInfoService/"
    "getSecuritiesMarketTotalCapitalInfo"
)
# 한 번에 받는 행 수. 전 기록이 1,209행(2026-10-06)이고 하루 한 행씩 는다.
# 모자라면 쪽을 넘겨 받는다(fetch_all).
PAGE_ROWS = 3000
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
    items: list[dict] = []
    page = 1
    while True:
        resp = get_with_retry(
            ENDPOINT,
            label="금투협 증시자금",
            params={
                "serviceKey": KSD_API_KEY,
                "resultType": "json",
                "numOfRows": PAGE_ROWS,
                "pageNo": page,
            },
        )
        if resp.status_code == 403:
            raise PermissionError(
                f"공공데이터포털 403: {resp.text[:200]} — '금융위원회_금융투자협회종합통계정보'에 "
                "활용신청이 돼 있는지 확인하세요."
            )
        resp.raise_for_status()
        body = resp.json()["response"]
        code = body["header"].get("resultCode")
        if code != "00":
            raise RuntimeError(f"공공데이터포털 응답 코드 {code}: {body['header'].get('resultMsg')}")
        got = (body["body"].get("items") or {}).get("item") or []
        items.extend(got)
        total = int(body["body"].get("totalCount") or 0)
        if not got or len(items) >= total:
            break
        page += 1

    out: dict[str, float] = {}
    for x in items:
        d, v = x.get("basDt"), x.get("invrDpsgAmt")
        if not d or v in (None, ""):
            continue
        out[f"{d[:4]}-{d[4:6]}-{d[6:8]}"] = float(v)
    return sorted(out.items())


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


def preview(rows: list[dict], path: str) -> None:
    """DB 를 안 건드리고, 로컬 dev 오버레이(dev-overrides.json 의 indicators)에 넣을 꼴로 쓴다.

    과열도(normalized_score)·기준선(threshold)은 calculate_score 와 같은 함수로 낸다 — 운영에선
    calculate_score 가 쓰는 값이라, 미리보기도 그 값과 같아야 카드 색·배지가 같다.
    """
    from config.indicator_thresholds import INDICATOR_THRESHOLDS
    from config.indicator_weights import INDICATOR_WEIGHTS
    from scripts.calculate_score import HOT_ZONE, compute_progress, raw_at_progress

    cfg = INDICATOR_THRESHOLDS[INDICATOR_SLUG]
    last = rows[-1]
    recent = rows[-30:]
    entry = {
        **{k: v for k, v in INDICATOR_META.items()},
        "direction": "high",
        "weight": INDICATOR_WEIGHTS.get(INDICATOR_SLUG, 1.0),
        "latest": {
            "date": last["date"],
            "raw_value": last["raw_value"],
            "normalized_score": round(compute_progress(INDICATOR_SLUG, last["raw_value"], cfg["threshold"], cfg), 2),
            "threshold": round(raw_at_progress(INDICATOR_SLUG, HOT_ZONE, cfg["threshold"], cfg) or 0, 2),
            "details": last["details"],
        },
        "history": [r["raw_value"] for r in recent],
        "historyPoints": [{"date": r["date"], "value": r["raw_value"]} for r in recent],
    }
    Path(path).write_text(json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[미리보기] {path} — {last['date']} {last['raw_value']:+.1f}% · 과열도 {entry['latest']['normalized_score']}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", metavar="PATH", help="DB 를 안 건드리고 dev 오버레이용 JSON 만 쓴다")
    args = ap.parse_args()

    if not KSD_API_KEY:
        print("[투자자예탁금] KSD_API_KEY 없음 — 건너뜁니다")
        return

    client = indicator_id = None
    if not args.preview:
        from common.indicator import ensure_indicator
        from common.supabase_client import get_client, load_keyset

        # 지표 행을 **먼저** 만든다. API 가 죽은 날에도 행은 있어야 calculate_score 가
        # "지표가 없다"로 통째로 멈추지 않고 '값 없음'으로 이 지표만 뺀다.
        client = get_client()
        indicator_id = ensure_indicator(client, INDICATOR_META)
        print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    series = fetch_all()
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
        preview(rows, args.preview)
        return

    # 전 기록을 다시 쓴다. 기준선이 날마다 움직이는 파생값이라(fetch_upbit_speculation 과 같은 이유)
    # 지난 날도 지금 공식으로 맞춰 둔다. 1,000행 남짓이라 500행씩 끊어 보낸다.
    #
    # details 는 calculate_score 와 나눠 쓰는 칸이다(hot_threshold 를 얹는다). 통째로 대입하면 그 키가
    # 날아가므로 기존 값을 읽어 내 키만 얹는다. 차트 점(SERIES_KEYS)만은 지난 행에서 걷는다 — 어제의
    # 최신 행에 실렸던 배열이 오늘부터는 아무도 안 보는 짐이 된다.
    existing = {
        r["date"]: (r.get("details") or {})
        for r in load_keyset(
            client, "indicator_values", "id,date,details", narrow=lambda q: q.eq("indicator_id", indicator_id)
        )
    }
    payload = []
    for r in rows:
        kept = {k: v for k, v in existing.get(r["date"], {}).items() if k not in SERIES_KEYS}
        payload.append({"indicator_id": indicator_id, **r, "details": {**kept, **r["details"]}})
    for i in range(0, len(payload), 500):
        client.table("indicator_values").upsert(payload[i : i + 500], on_conflict="indicator_id,date").execute()
    print(f"[Supabase] {len(payload)}일 upsert 완료")


if __name__ == "__main__":
    main()
