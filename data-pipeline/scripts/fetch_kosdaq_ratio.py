"""야후 파이낸스(^KQ11)로 코스닥 종가를 받아
"코스닥 신고가 대비 괴리율"(코스닥 종가 vs 자기 52주 전고점)을 계산해 Supabase에 upsert.

**2026-07-23 측정 방식 두 번째 교체.** 이 지표는 한 해에 두 번 갈아엎었다.
1) 원래는 코스닥 종가 ÷ 코스피 종가, 즉 두 지수의 '레벨 비율'이었다. 코스피(1980=100)와
   코스닥(1996=1000)은 기준일이 달라 비율의 절대 크기에 의미가 없고, 한쪽이 오르면 다른
   쪽이 그대로여도 값이 움직였다. 시간과의 상관이 -0.928인 순수 추세라 1년의 85%가 과열도
   100에 붙었다.
2) 그래서 '코스피 대비 20거래일 초과수익률'로 바꿨는데, 1년 백테스트에서 **froth와 정확히
   반대로 도는 것**이 드러났다(docs/indicator-audit-2026-07-23.md §3-3). 이번 상승장이
   대형주 주도였던 탓에 코스닥 초과수익 중앙값이 2026-05 -24.9%p, 06 -27.7%p로 **최고점
   근처에서 최악**이었고 폭락기에 -3.8%p로 회복했다. 전고점 괴리와의 순위상관 -0.224,
   고점창-저점창 스프레드 -35.0 으로 25개 지표 중 최악이었다 — 폭락 바닥에서 이 지표
   혼자 과열도 85.2를 찍었다.

**원인은 눈금이 아니라 측정 대상이었다.** "코스닥이 코스피보다 잘 갔나"는 대형주 장세에서
froth와 무관하다. 지표 설명이 원래 묻고 싶은 건 "잡주에 투기적 자금이 몰렸나"이므로,
코스피와 견주는 대신 **코스닥 자체가 신고가를 쓰고 있나**를 본다(kospi_high_gap과 같은 방식).
교체 후 전고점 괴리와의 상관이 -0.224 → **+0.678** 로 부호가 뒤집혔고, 가중치를 깎지 않고
2.0을 그대로 쓸 수 있게 됐다.

※ slug 는 `kosdaq_kospi_ratio` 그대로 둔다. 측정이 두 번 바뀌는 동안 이름이 실제 계산과
   어긋나 있지만, slug 를 바꾸면 지표 행이 새로 생기면서 1년치 히스토리·가중치 설정·
   프론트 참조가 전부 끊긴다. 화면에 보이는 name/description 만 실제 계산에 맞춘다.

코스닥 종가는 kospi_close_raw 와 같은 층의 내부용 지표(kosdaq_close_raw, is_public=false)에
쌓아 두고, 괴리율은 매 실행마다 계산 가능한 날짜 전체를 다시 계산해 upsert한다 — 공식이
바뀔 수 있는 파생값이라 "이미 있는 날짜는 건너뛰기" 방식이면 과거 값이 낡은 채로 남는다
(fetch_upbit_speculation.py와 같은 이유).

**소스가 KRX → 야후로 바뀌었다(2026-07-29).** KRX Open API 는 T일 종가를 T+1 오전에야
올려서 오후 실행조차 그날 종가를 못 받았다. 코스피 쪽(fetch_kospi_high_gap.py)과 같은
이유·같은 방식이고, 함정 셋은 common/yahoo_client.py 모듈 주석에 있다. 이 전환으로
'코스닥 시리즈 일별시세정보' 개별 서비스 승인은 더 이상 필요 없다.
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import get_client  # noqa: E402
from common.indicator import ensure_indicator  # noqa: E402
from common.timeutil import days_to_sync, today_kst  # noqa: E402
from common.yahoo_client import fetch_index_close_series  # noqa: E402

YAHOO_SYMBOL = "^KQ11"
BACKFILL_DAYS = 365
HIGH_WINDOW_DAYS = 365  # 전고점을 잡는 창(52주) — kospi_high_gap 과 동일

RAW_SLUG = "kosdaq_close_raw"
RAW_META = {
    "slug": RAW_SLUG,
    "name": "코스닥 지수 종가 (내부용 원본)",
    "category": "시장",
    "description_beginner": "신고가 대비 괴리율 계산에 쓰는 원본 데이터입니다",
    "unit": "pt",
    "is_public": False,
}

INDICATOR_SLUG = "kosdaq_kospi_ratio"  # 이름은 옛 측정 방식의 잔재 — 위 docstring 참고
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "코스닥 신고가 대비 괴리율",
    "headline": "코스닥이 자기 최고점에서 떨어진 거리",
    "category": "시장",
    "description_beginner": "코스닥이 신고가에 가까울수록 작은 종목에도 투기적인 돈이 몰렸다는 신호일 수 있습니다",
    "unit": "%",
    # 2026-07-23 점수·화면에서 내렸다. 타당성이 문제가 아니라(동행성 +0.678) 결국
    # kospi_high_gap 과 같은 것을 시장만 바꿔 재는 지표여서, 카드 한 칸을 kospi_speed_60d
    # 에 내줬다. 값 계산은 그대로 남겨 둔다 — 되돌리려면 is_public 과 두 config 만 되살리면
    # 된다. **is_public 을 안 내리면 프론트가 '미배치 공개 지표'로 자동 노출한다.**
    "is_public": False,
}


def get_indicator_values(client, indicator_id: str, start: date) -> dict[str, float]:
    result = (
        client.table("indicator_values")
        .select("date,raw_value")
        .eq("indicator_id", indicator_id)
        .gte("date", start.isoformat())
        .execute()
    )
    return {row["date"]: float(row["raw_value"]) for row in result.data}


def backfill_kosdaq_closes(client, raw_indicator_id: str) -> None:
    """코스닥 종가를 받아 채운다(kospi_close_raw와 같은 패턴 · 같은 헬퍼)."""
    # 야후 일봉은 KST 날짜로 떨어지므로 '오늘'도 KST 로 센다(fetch_kospi_high_gap 과 동일).
    today = today_kst()
    start = today - timedelta(days=BACKFILL_DAYS)
    existing = set(get_indicator_values(client, raw_indicator_id, start))

    # 빈 칸 + 최근 5영업일 재확인. 코스피 쪽과 같은 이유다 — 07-28 코스닥 종가가 시간봉
    # 근사치 697.76 으로 들어갔는데 일봉 확정값은 705.85(1.15% 차이)였고, '빈 칸만
    # 채우기'로는 갈아치울 길이 없었다(common/timeutil.days_to_sync 참고).
    target_days = days_to_sync(existing, today, bootstrap_days=BACKFILL_DAYS)
    if not target_days:
        print("[야후] 코스닥 종가 받을 날짜 없음")
        return

    prices = fetch_index_close_series(YAHOO_SYMBOL, BACKFILL_DAYS, today)
    print(f"[야후] 코스닥 종가 대상 {len(target_days)}일 · 응답 종가 {len(prices)}일치")

    rows = [
        {"indicator_id": raw_indicator_id, "date": d.isoformat(), "raw_value": prices[d.isoformat()]}
        for d in target_days
        if d.isoformat() in prices
    ]

    if rows:
        client.table("indicator_values").upsert(
            rows, on_conflict="indicator_id,date"
        ).execute()
    fresh = sum(1 for r in rows if r["date"] not in existing)
    print(
        f"[야후] 저장 완료: 신규 {fresh}건 · 재확인 {len(rows) - fresh}건 "
        f"(휴장일 등 {len(target_days) - len(rows)}건 제외)"
    )


def compute_high_gaps(prices: dict[str, float]) -> dict[str, tuple[float, float]]:
    """날짜별 (전고점 대비 괴리율 %, 그날 기준 전고점)을 돌려준다.

    fetch_kospi_high_gap.compute_gap 과 같은 규칙 — **그날을 제외한** 직전 365일 최고가를
    쓴다. 오늘을 포함해 max 를 잡으면 신고가를 쓴 날에도 괴리가 0에 캡돼 초과분이 안 보인다.
    """
    dates = sorted(prices)
    out: dict[str, tuple[float, float]] = {}
    for i, d in enumerate(dates):
        cutoff = (date.fromisoformat(d) - timedelta(days=HIGH_WINDOW_DAYS)).isoformat()
        window = [prices[x] for x in dates[:i] if x >= cutoff]
        if len(window) < 20:  # 창이 너무 짧으면 '전고점'이라 부를 수 없다
            continue
        prior_high = max(window)
        out[d] = ((prices[d] - prior_high) / prior_high * 100, prior_high)
    return out


def main() -> None:
    client = get_client()
    raw_id = ensure_indicator(client, RAW_META)
    indicator_id = ensure_indicator(client, INDICATOR_META)
    print(f"[Supabase] indicator '{RAW_SLUG}' id: {raw_id}")
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    backfill_kosdaq_closes(client, raw_id)

    start = today_kst() - timedelta(days=BACKFILL_DAYS)
    kosdaq_prices = get_indicator_values(client, raw_id, start)
    print(f"[Supabase] 코스닥 종가 {len(kosdaq_prices)}건 조회")

    gaps = compute_high_gaps(kosdaq_prices)
    if not gaps:
        print(f"[{INDICATOR_SLUG}] 전고점을 잡을 만큼 종가가 쌓이지 않았습니다")
        return

    rows = [
        {
            "indicator_id": indicator_id,
            "date": d,
            "raw_value": round(gap, 2),
            # 카드가 "코스닥 751 · 전고점 1,229" 처럼 근거를 같이 보여줄 수 있게 남긴다.
            "details": {"close": kosdaq_prices[d], "prior_high": round(high, 2)},
        }
        for d, (gap, high) in sorted(gaps.items())
    ]
    client.table("indicator_values").upsert(
        rows, on_conflict="indicator_id,date"
    ).execute()
    print(f"[Supabase] indicator_values upsert 완료: {len(rows)}건 (전량 재계산)")

    last = max(gaps)
    gap, high = gaps[last]
    print(
        f"[{INDICATOR_SLUG}] 최신값 ({last} 기준): "
        f"코스닥 {kosdaq_prices[last]:.2f} / 52주 전고점 {high:.2f} -> 괴리율 {gap:.2f}%"
    )


if __name__ == "__main__":
    # KRX 401(개별 서비스 미승인)을 받던 PermissionError 경로는 야후 전환으로 사라졌다
    # (fetch_kospi_high_gap.py 와 같은 이유).
    main()
