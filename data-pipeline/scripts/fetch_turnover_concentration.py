"""KRX 유가증권 종목별 일별매매(sto/stk_bydd_trd)로 '거래대금 쏠림도'를 계산해 저장.

froth 논리: 거래대금이 소수 종목에 쏠릴수록 = 다들 같은 핫한 종목/테마만 쫓는다 = 과열.
raw_value = 상위 10종목 거래대금 / 전체 KOSPI 거래대금 × 100 (%).

기존 '시총 쏠림도'(top10_market_cap_concentration)는 급락장의 대형주 도피에도 켜져 방향이
모호했다. '거래대금 쏠림'은 '다들 같은 종목을 사고판다'는 행동을 직접 재서 froth에 더 맞다.
다만 KOSPI 거래대금은 구조적으로 삼성전자·SK하이닉스에 크게 쏠려 있어(상시 70%+), 절대
수준 threshold는 낡는다. 그래서 youtube·예탁금처럼 '최근 평균 대비 급증(surge_map)'으로
쏠림 '심화'를 과열로 본다 — 평균이면 상온, 평균보다 쏠림이 커지면 초고온.

범위: KOSPI만 본다. KOSDAQ 엔드포인트(ksq_bydd_trd)는 2026-07-20 승인돼 호출은 가능해졌지만,
과거값이 전부 KOSPI 기준이라 지표 시계열의 연속성을 깨지 않으려고 확장은 보류했다. 테마·잡주
쏠림은 KOSDAQ에서 더 잘 드러나므로, 확장한다면 기존 slug를 덮지 말고 별도 지표로 두거나
과거분을 재계산해야 한다.
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.krx_client import krx_get  # noqa: E402
from common.supabase_client import get_client  # noqa: E402
from common.indicator import ensure_indicator  # noqa: E402
from common.yahoo_client import fetch_last_session_quote  # noqa: E402

KRX_URL = "http://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd"
TOP_N = 10
BACKFILL_DAYS = 30  # 최근 30일(달력) 조회 — 휴장일은 빈 응답이라 건너뛴다
REQUEST_DELAY_SEC = 0.05
# 종가 폴백이 거슬러 볼 행 수. 한 주치면 연휴를 덮고, 그보다 오래 비었다면 살릴 값이 없다.
FALLBACK_LOOKBACK_ROWS = 5
WON_PER_JO = 1_000_000_000_000

INDICATOR_SLUG = "turnover_concentration"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "거래대금 쏠림도",
    "category": "시장",
    "headline": "상위 10종목이 가져간 거래대금 비중",
    "description_beginner": "소수 종목에 쏠릴수록 과열 신호일 수 있습니다",
    "unit": "%",
}


def _to_float(s: str) -> float:
    try:
        return float((s or "0").replace(",", ""))
    except ValueError:
        return 0.0


def fetch_concentration(bas_dd: str):
    """(top10_share%, details) 반환. 휴장/실패면 None."""
    resp = krx_get(KRX_URL, bas_dd)
    if resp is None:
        return None
    if resp.status_code == 401:
        raise PermissionError(
            "KRX sto/stk_bydd_trd가 401. data.krx.co.kr에서 '유가증권 일별매매정보' "
            "Open API 이용신청·승인을 확인하세요."
        )
    rows = resp.json().get("OutBlock_1", [])
    vals = sorted((_to_float(d.get("ACC_TRDVAL")) for d in rows), reverse=True)
    total = sum(vals)
    if total <= 0 or len(vals) < TOP_N:
        return None
    top_n_sum = sum(vals[:TOP_N])
    share = round(top_n_sum / total * 100, 2)
    # 카드용: 상위 5종목 이름·비중
    named = sorted(rows, key=lambda d: _to_float(d.get("ACC_TRDVAL")), reverse=True)
    top5 = [
        {"name": d["ISU_NM"], "share": round(_to_float(d.get("ACC_TRDVAL")) / total * 100, 1)}
        for d in named[:5]
    ]
    details = {"top10_share": share, "total_jo": round(total / WON_PER_JO, 1), "top5": top5}
    return share, details


def _code_map(client, names: list[str]) -> dict[str, dict]:
    """종목명 → {code, market}. stocks 표에서 한 번에 찾는다."""
    if not names:
        return {}
    rows = client.table("stocks").select("code,name,market").in_("name", names).execute().data
    return {r["name"]: r for r in rows}


def attach_quotes(client, indicator_id: str, day: date, details: dict) -> dict:
    """최신 행의 top5 에 종가·52주 고점을 얹는다(신고가 카드 오른쪽 칸이 쓴다).

    **이 조회가 파이프라인에 있는 이유**: 예전엔 프론트가 화면을 그릴 때마다 야후를
    실시간으로 불렀다. 그러면 카드가 장중에 움직이는데 같은 카드 왼쪽 지수 게이지와
    햇쩨 지수는 하루 두 번만 바뀐다 — 한 화면에서 시점이 갈린다.

    **장중에는 값을 못 받는다**(yahoo_client 의 16:00 게이트). 그때는 **이미 저장된
    값을 그대로 살린다** — 아침 실행이 details 를 통째로 새로 쓰면서 전날 저녁이 넣어
    둔 종가를 지워 버리는 걸 막는다. `details` 는 여러 스크립트가 나눠 쓰는 칸이라
    통째 대입이 늘 이런 식으로 문다.

    ⚠️ **그 폴백은 '같은 날짜 행'을 보면 안 된다.** 처음에 그렇게 짰다가 폴백이 한 번도
    작동하지 못했다. KRX 거래대금이 T+1 이라 **아침 실행이 새 날짜 행을 그 자리에서
    처음 만든다** — 되살릴 값은 늘 그 **전날** 행에 있는데 갓 만든 빈 행을 뒤지니
    언제나 0개였다. 2026-07-29 아침에 카드 오른쪽 칸이 통째로 사라진 원인이 이것이고,
    아침마다 재현되는 종류였다(오후 실행이 채울 때까지 장중 내내). 그래서 날짜로 찾지
    않고 **종가가 실제로 붙어 있는 가장 최근 행**을 찾는다.

    종가 기준일(`price_date`)은 KRX 거래대금 기준일(행의 date)과 **다를 수 있다.**
    KRX 는 T+1 이라 행은 어제인데 종가는 오늘일 수 있어서다. 지수 게이지와 날짜를
    맞추는 게 목적이므로 이쪽이 맞고, 프론트가 그 날짜를 라벨로 쓴다.
    """
    top5 = details.get("top5") or []
    codes = _code_map(client, [s["name"] for s in top5])

    quoted, price_date = 0, None
    for stock in top5:
        info = codes.get(stock["name"])
        if not info:
            continue
        stock["code"] = info["code"]
        symbol = f"{info['code']}.{'KQ' if info.get('market') == 'KOSDAQ' else 'KS'}"
        quote = fetch_last_session_quote(symbol)
        if quote is None:
            continue
        session_date, close, high52 = quote
        if high52 is None or high52 <= 0:
            continue  # 52주 고점이 없으면 카드가 못 그린다
        stock["price"] = close
        stock["high52"] = high52
        stock["gap_pct"] = round((close / high52 - 1) * 100, 2)
        price_date = session_date
        quoted += 1

    if quoted:
        details["price_date"] = price_date
        print(f"[야후] 상위 종목 {quoted}개 종가 부착 ({price_date} 기준)")
        return details

    # 장중이거나 조회 실패 — 저장돼 있던 값을 되살린다. 위 주석대로 날짜가 아니라
    # '종가가 붙어 있는 최근 행'을 찾는다. 며칠치만 봐도 충분하다 — 그보다 오래
    # 비어 있었다면 오후 실행이 계속 실패했다는 뜻이라 살릴 값 자체가 없다.
    recent = (
        client.table("indicator_values")
        .select("date,details")
        .eq("indicator_id", indicator_id)
        .lte("date", day.isoformat())
        .order("date", desc=True)
        .limit(FALLBACK_LOOKBACK_ROWS)
        .execute()
    ).data or []
    old = next(
        (
            r["details"]
            for r in recent
            if any("price" in s for s in ((r.get("details") or {}).get("top5") or []))
        ),
        {},
    )
    old_by_name = {s["name"]: s for s in (old.get("top5") or []) if "price" in s}
    kept = 0
    for stock in top5:
        prior = old_by_name.get(stock["name"])
        if prior:
            stock.update({k: prior[k] for k in ("price", "high52", "gap_pct") if k in prior})
            kept += 1
    if old.get("price_date"):
        details["price_date"] = old["price_date"]
    print(f"[야후] 종가를 새로 못 받아 기존 값 {kept}개를 유지합니다 (기준 {old.get('price_date')})")
    return details


def main() -> None:
    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    saved = 0
    latest_line = None
    for offset in range(BACKFILL_DAYS):
        d = date.today() - timedelta(days=offset)
        if d.weekday() >= 5:  # 주말 skip
            continue
        bas_dd = d.strftime("%Y%m%d")
        result = fetch_concentration(bas_dd)
        if result is None:
            continue  # 휴장/데이터 없음
        share, details = result
        # 종가는 화면에 뜨는 최신 행에만 붙인다 — 프론트가 그 행 하나만 읽고, 과거
        # 날짜의 52주 고점은 야후가 소급해서 주지도 않는다.
        if latest_line is None:
            details = attach_quotes(client, indicator_id, d, details)
        client.table("indicator_values").upsert(
            {"indicator_id": indicator_id, "date": d.isoformat(), "raw_value": share, "details": details},
            on_conflict="indicator_id,date",
        ).execute()
        saved += 1
        if latest_line is None:
            latest_line = f"{d.isoformat()} 상위10 거래대금 비중 {share}% (총 {details['total_jo']}조, 1위 {details['top5'][0]['name']} {details['top5'][0]['share']}%)"
    print(f"[KRX] 거래대금 쏠림 {saved}일치 저장. 최신: {latest_line}")


if __name__ == "__main__":
    main()
