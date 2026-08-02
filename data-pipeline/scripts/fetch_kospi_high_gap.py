"""야후 파이낸스로 코스피 지수 종가를 받아와 52주 신고가 대비 괴리율을 계산해 Supabase에 upsert.

최초 실행 시 최근 1년치 일별 종가를 백필해서 raw price 캐시(kospi_close_raw indicator)에
저장하고, 이후 실행부터는 아직 없는 날짜만 추가로 채운다. 매 실행마다 최신 종가 기준
52주 신고가 대비 괴리율을 계산해 kospi_high_gap indicator의 오늘 값으로 upsert한다.

**소스가 KRX → 야후로 바뀌었다(2026-07-29).** KRX Open API 는 T일 종가를 T+1 오전에야
올려서 오후 실행(~19:50 KST)도 그날 종가를 못 받았다. 야후는 장 마감 직후에 준다.
값은 같다 — 전환 시점에 겹치는 날짜를 대조해 소수점까지 일치함을 확인했다. 자세한
배경과 이 소스가 가진 함정 셋은 common/yahoo_client.py 의 모듈 주석에 있다.
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

YAHOO_SYMBOL = "^KS11"
BACKFILL_DAYS = 365

RAW_SLUG = "kospi_close_raw"
RAW_META = {
    "slug": RAW_SLUG,
    "name": "코스피 지수 종가 (내부용 원본)",
    "category": "시장",
    "description_beginner": "52주 신고가 대비 괴리율 계산을 위해 내부적으로 저장하는 코스피 지수 종가 데이터입니다.",
    "unit": "pt",
    "is_public": False,
}

GAP_SLUG = "kospi_high_gap"
GAP_META = {
    "slug": GAP_SLUG,
    "name": "코스피 신고가 대비 괴리율",
    "headline": "현재 지수와 52주 신고가 사이의 거리",
    "category": "시장",
    # 카드가 2칸으로 넓어져 설명 자리가 늘었다 — 기존 39자를 70자 안팎으로 늘려
    # "왜 이 숫자가 과열 신호인지"까지 한 문장 더 담는다.
    # 2칸 카드의 설명 칸은 폭 528px · 11px 기준 **한 줄에 약 47자**라, 두 줄이면 94자가
    # 한계선이다(재보려면 브라우저에서 그 <p> 폭을 nowrap 실측폭으로 나누면 된다).
    # 한 줄로 끝내면 카드 아래가 허전해 옆의 1칸 카드들과 무게가 안 맞는다.
    "description_beginner": "0%에 가까울수록 신고가를 새로 쓰는 중입니다",
    "unit": "%",
}

# 같은 종가 캐시에서 파생되는 두 번째 지표. '얼마나 높이 왔나'(GAP)와 '얼마나 빨리
# 왔나'(SPEED)는 실측 상관이 +0.13으로 거의 직교한다 — 2025-08(코스피 3,186, 정체)과
# 2026-05(8,476, 두 달 만에 +28%)를 가르는 게 정확히 이 축인데 지금까지 지수에 없었다.
# 1년 백테스트에서 향후 최대낙폭과의 순위상관이 -0.79(블록 부트스트랩 95% CI
# [-0.89, -0.66])로 전체 지표 중 가장 강했다. docs/indicator-audit-2026-07-23.md §9 참고.
SPEED_SLUG = "kospi_speed_60d"
# 거래일. 120일이 수치는 더 좋지만 '최근 석 달'이 froth 의미에 맞다.
# ⚠️ **화면 문구는 값이 서로 어긋나면 안 된다. "두 달"은 틀린 값이었다.**
# 60거래일 ÷ 21거래일/월 = 2.86개월이라 석 달(=3개월=90일)이 맞고, 두 달이면 42거래일이다.
# 한때 headline 은 석 달, 초보 설명은 두 달, 카드 축은 60일이라 같은 창을 세 가지 값으로
# 부르고 있었다.
#
# 지금은 표현만 자리에 맞게 다르고 값은 전부 같다:
#   headline "최근 3개월" · 초보 설명 "석 달" · 차트 축 "90일 전"
# 차트 축이 달력일인 건 x축이 시간이라 그 단위가 자연스러워서다(실제 span 은 60거래일
# ≈ 84일이라 90은 어림값이다). 정확한 거래일 수는 여기 상수와 코드 주석에만 둔다.
SPEED_WINDOW = 60
SPEED_META = {
    "slug": SPEED_SLUG,
    "name": "코스피 상승 속도",
    "headline": "최근 3개월 동안 오른 폭",
    "category": "시장",
    "description_beginner": (
        "천천히 오른 것과 급하게 온 것은 다릅니다"
    ),
    "unit": "%",
}


def backfill_raw_prices(client, raw_indicator_id: str) -> None:
    # 야후 일봉은 KST 날짜로 떨어지므로 '오늘'도 KST 로 센다. 러너는 UTC 라 date.today()
    # 를 쓰면 KST 이른 아침에 하루가 어긋난다(common/timeutil 참고).
    today = today_kst()
    start = today - timedelta(days=BACKFILL_DAYS)

    existing = (
        client.table("indicator_values")
        .select("date")
        .eq("indicator_id", raw_indicator_id)
        .gte("date", start.isoformat())
        .execute()
    )
    existing_dates = {row["date"] for row in existing.data}

    # 옛 공휴일을 매 실행 다시 물어보지 않도록 최근 창만 훑되, 최근 5영업일은 이미 있어도
    # 다시 받아 덮어쓴다 — 야후가 나중에 확정하는 값이라 '빈 칸만 채우기'로 두면 덜 익은
    # 값이 영영 남는다(common/timeutil.days_to_sync 주석에 사고 둘이 적혀 있다).
    target_days = days_to_sync(existing_dates, today, bootstrap_days=BACKFILL_DAYS)
    if not target_days:
        print("[야후] 받을 날짜 없음")
        return

    # KRX 때와 달리 날짜마다 부르지 않는다. 한 번에 기간 전체를 받아 놓고 필요한 날짜만
    # 꺼내 쓴다(요청 N회 → 2회). 그래서 REQUEST_DELAY_SEC 도 없어졌다.
    # existing_dates 를 넘기는 이유는 시간봉 폴백이 **이미 있는 날짜를 근사치로 덮어쓰지
    # 못하게** 하기 위해서다(yahoo_client 의 ② 주석). 안 넘기면 저녁이 받아 둔 정확한
    # 종가를 다음 날 아침이 되돌린다.
    prices = fetch_index_close_series(YAHOO_SYMBOL, BACKFILL_DAYS, today, known=existing_dates)
    print(f"[야후] 대상 {len(target_days)}일 · 응답 종가 {len(prices)}일치")

    new_rows = [
        {"indicator_id": raw_indicator_id, "date": d.isoformat(), "raw_value": prices[d.isoformat()]}
        for d in target_days
        if d.isoformat() in prices
    ]

    if new_rows:
        client.table("indicator_values").upsert(
            new_rows, on_conflict="indicator_id,date"
        ).execute()
    fresh = sum(1 for r in new_rows if r["date"] not in existing_dates)
    print(
        f"[야후] 저장 완료: 신규 {fresh}건 · 재확인 {len(new_rows) - fresh}건 "
        f"(휴장일 등 {len(target_days) - len(new_rows)}건 제외)"
    )


def compute_speed(client, raw_indicator_id: str) -> list[dict]:
    """60거래일 수익률을 계산 가능한 **모든 날짜**에 대해 돌려준다.

    gap 과 달리 오늘 한 행만 쓰지 않고 전량 재계산하는 이유는 fetch_kosdaq_ratio·
    fetch_upbit_speculation 과 같다 — 공식이 바뀔 수 있는 파생값이라 "이미 있는 날짜는
    건너뛰기"로 두면 과거 값이 낡은 채 남는다. 카드의 추세선도 이 히스토리를 쓴다.
    """
    rows = (
        client.table("indicator_values")
        .select("date,raw_value")
        .eq("indicator_id", raw_indicator_id)
        .order("date")
        .execute()
    ).data
    prices = {r["date"]: float(r["raw_value"]) for r in rows}
    dates = sorted(prices)
    return [
        {
            "date": dates[i],
            "raw_value": round((prices[dates[i]] / prices[dates[i - SPEED_WINDOW]] - 1) * 100, 2),
            "from_close": prices[dates[i - SPEED_WINDOW]],
            "to_close": prices[dates[i]],
        }
        for i in range(SPEED_WINDOW, len(dates))
    ]


def compute_gap(client, raw_indicator_id: str) -> tuple[str, float, float, float]:
    # 지표 이름 그대로 '52주' 창으로 자른다. 예전엔 날짜 필터가 없어 저장된 종가 전부에서
    # 전고점을 잡았는데, 백필이 옛 행을 지우지 않아 표가 계속 자라므로 실제로는 '전체 기간
    # 최고가'였다(이미 365일 밖 행이 9개 있었다). 지금은 최고점이 1년 안이라 값이 우연히
    # 같지만, 고점이 1년보다 오래되는 순간 "52주 괴리율"이 조용히 틀려진다.
    window_start = (today_kst() - timedelta(days=BACKFILL_DAYS)).isoformat()
    rows = (
        client.table("indicator_values")
        .select("date,raw_value")
        .eq("indicator_id", raw_indicator_id)
        .gte("date", window_start)
        .order("date", desc=True)
        .execute()
    ).data
    if not rows:
        raise RuntimeError("52주 신고가를 계산할 종가 데이터가 없습니다")

    latest_date = rows[0]["date"]
    latest_close = float(rows[0]["raw_value"])
    # 오늘(rows[0])을 제외한 전고점. 오늘 종가가 이걸 넘으면 '신고가'라 gap이 양수(+X%)로
    # 나와 화면에 "이전 전고점 대비 +X%"를 표시할 수 있다. 넘지 못하면 음수(-X%, 전고점
    # 아래). 오늘을 포함해 max를 잡으면 신고가 날에도 gap이 0에 캡돼 초과분이 안 보인다.
    prior_high = max((float(r["raw_value"]) for r in rows[1:]), default=latest_close)
    gap_pct = (latest_close - prior_high) / prior_high * 100
    return latest_date, latest_close, prior_high, gap_pct


def main() -> None:
    client = get_client()

    raw_id = ensure_indicator(client, RAW_META)
    gap_id = ensure_indicator(client, GAP_META)
    speed_id = ensure_indicator(client, SPEED_META)
    print(f"[Supabase] indicator '{RAW_SLUG}' id: {raw_id}")
    print(f"[Supabase] indicator '{GAP_SLUG}' id: {gap_id}")
    print(f"[Supabase] indicator '{SPEED_SLUG}' id: {speed_id}")

    backfill_raw_prices(client, raw_id)

    latest_date, latest_close, high, gap_pct = compute_gap(client, raw_id)
    print(
        f"[계산] 최근 종가 {latest_close} ({latest_date} 기준) / 52주 신고가 {high} "
        f"-> 괴리율 {gap_pct:.2f}%"
    )

    today = date.today().isoformat()
    rounded_gap = round(gap_pct, 2)
    client.table("indicator_values").upsert(
        {
            "indicator_id": gap_id,
            "date": today,
            "raw_value": rounded_gap,
            # 행의 date 는 '계산한 날'이지 '자료의 날'이 아니다. KRX가 최근 영업일치를
            # 아직 안 냈으면 며칠 전 종가로 오늘 행을 써서 화면상 최신값처럼 보인다.
            # 실제 종가 기준일을 남겨 카드가 "기준 07-16"을 표시할 수 있게 한다
            # (details 는 숫자 맵이라 YYYYMMDD 정수로 넣는다).
            # close/prior_high 는 카드가 "-25%"의 근거(6,798 vs 전고점 9,115)를 그대로
            # 보여주기 위한 값이다.
            "details": {
                "source_date": int(latest_date.replace("-", "")),
                "close": round(latest_close, 2),
                "prior_high": round(high, 2),
            },
        },
        on_conflict="indicator_id,date",
    ).execute()
    print(f"[Supabase] indicator_values upsert 완료: date={today}, raw_value={rounded_gap}")

    speed_rows = compute_speed(client, raw_id)
    if speed_rows:
        client.table("indicator_values").upsert(
            [
                {
                    "indicator_id": speed_id,
                    "date": r["date"],
                    "raw_value": r["raw_value"],
                    # source_date 는 이 행이 어느 거래일 종가 기준인지 — 카드 배지가
                    # 신고가 괴리율 카드와 같은 형식("7/22 기준")으로 쓴다. 여기선 행의
                    # date 자체가 자료의 날이라 그대로 넣는다.
                    "details": {
                        "source_date": int(r["date"].replace("-", "")),
                        "from_close": r["from_close"],
                        "to_close": r["to_close"],
                    },
                }
                for r in speed_rows
            ],
            on_conflict="indicator_id,date",
        ).execute()
        last = speed_rows[-1]
        print(
            f"[Supabase] '{SPEED_SLUG}' upsert 완료: {len(speed_rows)}건 (전량 재계산). "
            f"최신 {last['date']} {last['from_close']:.0f} → {last['to_close']:.0f} "
            f"= {last['raw_value']:+.2f}%"
        )
    else:
        print(f"[{SPEED_SLUG}] 종가가 {SPEED_WINDOW}거래일치보다 적어 아직 계산 불가")


if __name__ == "__main__":
    # KRX 를 쓰던 시절엔 401(개별 서비스 미승인)을 PermissionError 로 올려 여기서 받았다.
    # 야후는 승인 개념이 없어 그 경로가 통째로 사라졌다 — 조회 실패는 yahoo_client 가
    # 빈 결과로 돌려주고, 그러면 그날만 비워 두고 다음 실행이 채운다.
    main()
