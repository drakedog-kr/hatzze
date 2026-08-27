"""KRX Open API 로 **국내 상장 미국 ETF** 하루치를 `seohak_etf_daily` 에 upsert.

서학개미 장부의 'ETF 자금 유입'·'주간 등락' 두 카드가 이 표를 읽는다.

## ⭐ 이 표가 재는 것은 거래대금이 아니라 **실제로 남은 돈**이다

    net_flow = (오늘 상장좌수 − 직전 거래일 상장좌수) × 오늘 NAV

설정·환매만 잡는다. 같은 돈이 사고팔리며 오간 것(거래대금)은 안 센다 — 실측으로
1,163종목 중 좌수가 변한 건 하루 80여 종목뿐이다. 그래서 직전 거래일 좌수가 필요하고,
그건 이 표에서 읽는다(첫 실행이거나 앞 날이 비면 그날 `net_flow` 는 None 이다).

## ⚠️⚠️ 미국 판정은 **종목명**으로 한다. 기초지수명으로 하면 안 된다

기초지수명에 미국 지수사업자 이름이 든 **비미국 상품이 43건**이다 — `S&P GSCI 금선물`·
`S&P Korea 저변동성`·`Dow Jones Target 2030`(TDF). 그래서 `index_name` 은 저장만 하고
판정에는 안 쓴다(표의 칸 주석에도 그렇게 적혀 있다).

## ⚠️ 낱말 규칙이라 오탐이 난다. 그래서 빼는 목록이 둘이다

`미국` 이 없어도 미국 대표기업 이름이면 담는데(`TIGER 구글밸류체인`), 그 낱말이 엉뚱한
데 걸린다.

    NOT_US   메타 → **메타버스** 4건이 걸렸다(`RISE 메타버스`·`HANARO Fn K-메타버스MZ`).
             차이나·코리아·대만도 `다우존스`·`빅테크` 로 딸려 온다.
    NOT_EQ   `미국달러선물`·`미국달러단기채권`·`미국머니마켓` 은 미국 **주식**이 아니다.
             `채권혼합` 도 뺀다 — 주식이 절반뿐이라 유입을 주식 자금으로 못 읽는다.

⭐ 2026-08-19 에 앞 규칙과 맞대어 재니 **272 → 266** 이었다.
   빠진 8건: 메타버스 4 · 차이나 1 · 달러단기채·머니마켓 3 (전부 오탐)
   더한 2건: `KIWOOM 미국원유에너지기업` · `RISE 미국S&P원유생산기업` (진짜 미국 주식)

⚠️ 채권형(`ACE 미국30년국채액티브` 등)은 **담는다.** 화면 쪽 로더가 읽을 때 거른다
(`lib/seohak-etf.ts` 의 `BOND_LIKE`) — 표에는 남겨 둬야 되살릴 수 있다.
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.krx_client import krx_get  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

# 담는 낱말. `미국` 과 미국 대표기업 이름.
US_MARKERS = (
    "미국", "나스닥", "S&P500", "S&P 500", "다우존스", "필라델피아", "러셀",
    "테슬라", "엔비디아", "애플", "구글", "알파벳", "마이크로소프트", "아마존",
    "메타", "브로드컴", "팔란티어", "넷플릭스", "코인베이스",
)
# ⛔ 위 낱말에 걸리지만 미국 상품이 아닌 것.
NOT_US = (
    "메타버스", "차이나", "중국", "일본", "인도", "유럽", "글로벌",
    "한국", "K-", "코리아", "대만", "아시아",
)
# ⛔ 미국이지만 **주식**이 아닌 것.
NOT_EQUITY = ("채권혼합", "달러선물", "SOFR", "달러단기", "머니마켓", "MMF", "달러채권")

KRX_URL = "https://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd"
LOOKBACK_DAYS = 7
CHUNK = 500
# 한 거래일도 못 받았을 때, 표가 이만큼(달력일) 낡았어야 알람을 켠다.
# KRX 는 당일치를 주므로 정상이면 오늘이 최신이고, 가장 긴 휴장은 연휴+주말 닷새다.
STALE_ALERT_DAYS = 6


def is_us_equity(name: str) -> bool:
    if any(k in name for k in NOT_US) or any(k in name for k in NOT_EQUITY):
        return False
    return any(k in name for k in US_MARKERS)


def num(v: str | None) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def main() -> None:
    db = get_client()

    # 직전 거래일 좌수 — net_flow 의 분모다. 넉넉히 3주치를 읽어 연휴를 건넌다.
    #
    # ⚠️⚠️ **페이징을 해야 한다.** PostgREST 는 한 번에 1,000행만 준다. 하루 266종목이라
    # 3주면 4,000행이 넘는데, 페이징 없이 `order("trade_date")` 로 받으면 **가장 오래된
    # 나흘치**만 오고 정작 필요한 최근 날짜가 통째로 빠진다. 그러면 `before` 가 비어
    # net_flow 가 전부 None 이 되는데, **에러가 아니라 "좌수가 안 변했다"로 보인다** —
    # 실제로 그렇게 나서 하루 순유입이 0억으로 찍혔다.
    # (이 저장소가 같은 캡에 걸린 게 이번이 여섯 번째다.)
    since = (date.today() - timedelta(days=21)).isoformat()
    prev: list[dict] = []
    start = 0
    while True:
        page = (
            db.table("seohak_etf_daily")
            .select("trade_date, isu_cd, list_shares")
            .gte("trade_date", since)
            .order("trade_date")
            .order("isu_cd")
            .range(start, start + 999)
            .execute()
            .data
            or []
        )
        prev.extend(page)
        if len(page) < 1000:
            break
        start += 1000
    shares_by_day: dict[str, dict[str, float]] = {}
    for r in prev:
        shares_by_day.setdefault(r["trade_date"], {})[r["isu_cd"]] = r["list_shares"]

    rows: list[dict] = []
    days = 0
    for back in range(LOOKBACK_DAYS):
        day = date.today() - timedelta(days=back)
        bas_dd = day.strftime("%Y%m%d")
        # ⚠️ `krx_get` 은 응답 객체를 준다(딕셔너리가 아니다). 401 은 재시도 없이
        #    그대로 오므로 여기서 알아채고 죽인다 — 승인 만료를 조용히 넘기면 안 된다.
        res = krx_get(KRX_URL, bas_dd)
        if res is None:
            print(f"[ETF] {day} 조회 실패 — 건너뜁니다")
            continue
        if res.status_code == 401:
            raise RuntimeError("KRX 401 — etp 계열 승인이 풀렸다(만료일 확인)")
        res.raise_for_status()
        items = res.json().get("OutBlock_1") or []
        if not items:
            continue
        # ⚠️⚠️ **휴장일에도 1,163행을 준다.** `BAS_DD` 는 요청한 날짜를 그대로 되돌려
        # 주므로 응답만 봐서는 못 가른다 — 실측(2026-08-15 토 · 08-16 일 · 08-17 대체
        # 공휴일) 셋 다 행 수가 같았다. 그대로 저장했더니 **가짜 거래일 셋**이 생겼고,
        # 그 바람에 '직전 거래일' 이 08-16 이 되어 좌수 차이가 0 → 하루 순유입이
        # 0억으로 찍혔다(에러가 아니라 "안 움직였다"로 보인다).
        # ⭐ 가르는 건 **거래대금 합계**다. 휴장일은 전 종목이 0 이다.
        if sum(num(x.get("ACC_TRDVAL")) or 0 for x in items) <= 0:
            print(f"[ETF] {day} 휴장(거래대금 0) — 건너뜁니다")
            continue
        days += 1
        # ⚠️ 직전 **거래일**이다. 달력 하루 전이 아니다(주말·연휴).
        earlier = sorted(d for d in shares_by_day if d < day.isoformat())
        before = shares_by_day.get(earlier[-1], {}) if earlier else {}
        picked = [x for x in items if is_us_equity(x["ISU_NM"])]
        for x in picked:
            nav = num(x.get("NAV"))
            shares = num(x.get("LIST_SHRS"))
            was = before.get(x["ISU_CD"])
            flow = None
            if nav is not None and shares is not None and was is not None:
                flow = (shares - float(was)) * nav
            close = num(x.get("TDD_CLSPRC"))
            rows.append({
                "trade_date": day.isoformat(),
                "isu_cd": x["ISU_CD"],
                "isu_nm": x["ISU_NM"],
                "close_price": close,
                "nav": nav,
                "premium_pct": None if not nav or close is None else (close - nav) / nav * 100,
                "fluc_rate": num(x.get("FLUC_RT")),
                "trade_value": num(x.get("ACC_TRDVAL")),
                "list_shares": shares,
                "net_asset": num(x.get("INVSTASST_NETASST_TOTAMT")),
                "net_flow": flow,
                "index_name": x.get("IDX_IND_NM"),
                # 환헤지형은 이름 끝의 (H)·(합성 H) 로만 드러난다. 원천에 칸이 없다.
                "is_hedged": "(H)" in x["ISU_NM"] or "합성 H" in x["ISU_NM"],
                "is_leverage": any(k in x["ISU_NM"] for k in ("레버리지", "인버스", "2X", "3X")),
            })
        # 방금 받은 날도 다음 날의 '직전'이 될 수 있다.
        shares_by_day[day.isoformat()] = {
            x["ISU_CD"]: num(x.get("LIST_SHRS")) for x in picked
        }

    if not rows:
        # ⚠️ "못 받았다"와 "표가 낡았다"는 다른 사건이다. KRX 가 하루 막히거나 연휴가
        #    길면 이번 실행이 빈손일 수 있는데, 이레를 되돌아보므로 다음 실행이
        #    메운다. 잣대를 **표의 최신 거래일**로 옮긴다 — 하루 실패마다 알람을
        #    켜면 며칠이면 아무도 그 알람을 안 보게 되고 진짜 고장이 거기 묻힌다.
        newest = (
            db.table("seohak_etf_daily")
            .select("trade_date")
            .order("trade_date", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if not newest:
            raise RuntimeError("ETF 자료를 하나도 못 받았고 표도 비어 있다")
        seen = date.fromisoformat(newest[0]["trade_date"])
        stale = (date.today() - seen).days
        if stale <= STALE_ALERT_DAYS:
            print(
                f"[ETF] 최근 {LOOKBACK_DAYS}일에 새로 받은 게 없습니다. 표는 {seen} 까지 "
                f"있어 {stale}일 됐고 {STALE_ALERT_DAYS}일 안쪽이라 다음 실행이 만회합니다."
            )
            return
        raise RuntimeError(
            f"ETF 자료를 하나도 못 받았고 표가 {seen} 에서 {stale}일 멈춰 있다"
        )

    for i in range(0, len(rows), CHUNK):
        db.table("seohak_etf_daily").upsert(
            rows[i : i + CHUNK], on_conflict="trade_date,isu_cd"
        ).execute()

    latest = max(r["trade_date"] for r in rows)
    last = [r for r in rows if r["trade_date"] == latest]
    flowed = [r for r in last if r["net_flow"]]
    total = sum(r["net_flow"] for r in flowed) / 1e8
    print(
        f"[Supabase] seohak_etf_daily upsert 완료: {len(rows)}행 · 거래일 {days}일 "
        f"· 최신 {latest} {len(last)}종목"
    )
    print(f"  좌수가 변한 종목 {len(flowed)}개 · 하루 순유입 합 {total:,.0f}억")


if __name__ == "__main__":
    main()
