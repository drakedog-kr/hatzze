"""국내 상장 ETF **전체**의 일별 자금 유출입을 `etf_flow_daily` 에 쌓는다 — ETF 자금 흐름 화면(/etf)의 재료.

KRX OPEN API ETF 일별매매정보(etp/etf_bydd_trd)는 날짜 하나에 그날 상장된 ETF 전부(2026-10 기준 1,172종목)를 준다.
화면은 이 표를 직접 읽지 않고 뷰 `etf_flow_board`(마이그레이션 094)가 ETF 마다 5·20거래일 합으로 접은 것을 읽는다.

미국 기초자산만 담는 `fetch_seohak_etf.py`(배당 화면 재료)와 같은 엔드포인트 · 같은 셈이다. 그쪽이 겪은 함정을
그대로 물려받는다 — 아래 ⚠️ 셋은 거기서 실제로 났던 일이다.

## 순유입은 좌수 변화다

    net_flow = (오늘 상장좌수 − 직전 거래일 상장좌수) × 오늘 NAV

설정·환매로 실제로 남은 돈만 잡는다(거래대금은 같은 돈이 사고팔리며 오간 것도 센다). 2025-09-24 코스콤 ETF체크
기사의 '최근 1개월 유입 1위 KODEX 머니마켓액티브 · 유출 1위 KODEX 레버리지'를 이 식으로 다시 재면 1위 둘이 같았다
(2026-10-11). 금액은 기간을 어디서 끊느냐에 따라 흔들린다 — KODEX 레버리지는 LP 설정·환매가 날마다 ±2천억씩 번갈아
경계 하루로 금액이 출렁인다. 그래서 화면은 하루 값 대신 5·20거래일 합을 쓴다.

## 매 실행 최근 LOOKBACK_DAYS 를 다시 받는다

빠진 날만 받는 대신 최근 이레를 통째로 다시 받아 덮는다. 앞 실행이 KRX 에 막혀 하루를 빠뜨렸어도 이번 실행이 그 날과
그다음 날의 순유입을 함께 바로잡는다(빠진 날 몫이 다음 날에 이틀치로 얹혀 있던 것을 되돌린다). 하루 한 번 호출이라 이레면
7번이다. 처음 채울 땐 `--days 400` 으로 길게 받는다(화면의 1년 + 시작일 여유 · 아래 '1년 합').

⚠️ **휴장일에도 1,172행을 준다.** `BAS_DD` 는 요청한 날짜를 그대로 되돌려 주고 좌수까지 실려 와서 응답 행 수로는 못 가른다.
   그대로 저장하면 가짜 거래일이 생기고, 다음 날의 '직전 거래일'이 그 날이 되어 좌수 차이가 0 — 순유입이 '안 움직였다'로
   찍힌다(fetch_seohak_etf.py 2026-08-15~17). 가르는 건 **거래대금 합계**다. 휴장일은 전 종목이 0 이다.
⚠️ **오래된 날부터** 돈다. 오늘부터 거꾸로 돌면 방금 받은 날이 늘 더 늦은 날이라 다음 날의 '직전'이 못 되고, 그 날 몫이
   자기 행과 다음 행에 두 번 들어간다.
⚠️ **KRX 가 받아 둔 거래일을 비워 줄 때가 있다.** 2026-10-12 새벽 2시(KST) 백필에서 ETF · 주식 · 지수 세 서비스가 모두
   10-08(거래일)에 0행을 줬다(10-11 에는 받았다). 휴장으로 보고 건너뛰면 다음 거래일 순유입이 이틀치 좌수 차이가 되어, 표에 남은
   그 날 행과 **두 번 세어진다.** 그래서 비어 온 날이라도 표에 그 날 행이 있으면 그 좌수를 다음 날의 '직전'으로 쓴다.
⚠️ 직전 거래일 좌수를 표에서 읽을 땐 **페이징**한다. 하루 1,172행이라 PostgREST 1,000행 캡에 바로 걸린다 — 잘리면 에러가
   아니라 일부 종목의 순유입이 None 으로 빠질 뿐이라 눈에 안 띈다.

## 쓴 뒤 1년 합을 새로 고친다

화면의 기간 '1년'은 ETF 마다 1년 순유입을 한 줄로 접어 둔 머티리얼라이즈드 뷰 `etf_flow_year`(마이그레이션 097 · 100)를 읽는다.
하루치를 쓴 실행은 끝에 `refresh_etf_flow_year()` 를 부른다. 1년 합이 맞으려면 표가 1년 앞 거래일까지 차 있어야 해서
처음 한 번은 `--days 400` 으로 길게 받는다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_etf_flows.py                 # 최근 이레
    python scripts/fetch_etf_flows.py --days 400      # 처음 채울 때(1년 합 · 마이그레이션 097)
    python scripts/fetch_etf_flows.py --dry-run       # 받을 날과 행 수만 찍는다(DB 에 안 쓴다)
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.krx_client import krx_get  # noqa: E402
from common.supabase_client import execute_with_retry, get_client  # noqa: E402
from common.timeutil import business_days, today_kst  # noqa: E402

KRX_URL = "https://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd"
TABLE = "etf_flow_daily"
LOOKBACK_DAYS = 7
CHUNK = 500
# 표에서 읽은 '직전 거래일'이 첫 날보다 이만큼(달력일) 넘게 앞서면 직전으로 안 쓴다 — 파이프라인이 오래 멈췄다
# 돌아온 날, 그 사이 몇 주치 설정·환매가 하루에 얹히는 것을 막는다. 가장 긴 휴장은 연휴+주말 열흘 안쪽이다.
MAX_GAP_DAYS = 10
# 한 거래일도 못 받았을 때, 표가 이만큼(달력일) 낡았어야 알람을 켠다.
STALE_ALERT_DAYS = 6


def num(v) -> float | None:
    """KRX 숫자 문자열('12,345' · '-0.19')을 float 로. 빈 값/파싱 실패는 None."""
    if v is None:
        return None
    s = str(v).replace(",", "").strip()
    if not s or s == "-":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def is_holiday(items: list[dict]) -> bool:
    """휴장일(또는 아직 공표 전)인가 — 거래대금 합계가 0 이면 그렇다(머리말 ⚠️ 첫째)."""
    return sum(num(x.get("ACC_TRDVAL")) or 0 for x in items) <= 0


def parse_day(items: list[dict], day: str, before: dict[str, float]) -> tuple[list[dict], dict[str, float]]:
    """그날 응답 → 표의 행과 그날 좌수. before 는 직전 거래일의 {코드: 좌수}다(없으면 그날 순유입은 None)."""
    rows: list[dict] = []
    shares_today: dict[str, float] = {}
    for x in items:
        code = (x.get("ISU_CD") or "").strip()
        name = (x.get("ISU_NM") or "").strip()
        if not code or not name:
            continue
        shares = num(x.get("LIST_SHRS"))
        nav = num(x.get("NAV"))
        was = before.get(code)
        flow = None
        if shares is not None and nav is not None and was is not None:
            flow = (shares - was) * nav
        if shares is not None:
            shares_today[code] = shares
        # ⚠️ 가장 최근 거래일은 순자산 칸이 전 종목 0 으로 온다(2026-10-11 실측 · 10-08분 1,172종목 모두 '0', 앞 날짜는 값이 있다).
        #    순자산은 정의상 좌수 × NAV 라 그 곱으로 채운다(1Q 200액티브 4,267억 · 시가총액 4,271억). 이레를 다시 받으므로
        #    KRX 가 나중에 칸을 채우면 그 값으로 덮인다.
        net_asset = num(x.get("INVSTASST_NETASST_TOTAMT"))
        if not net_asset and shares is not None and nav is not None:
            net_asset = shares * nav
        rows.append({
            "trade_date": day,
            "isu_cd": code,
            "isu_nm": name,
            "index_name": (x.get("IDX_IND_NM") or "").strip() or None,
            "close_price": num(x.get("TDD_CLSPRC")),
            "nav": nav,
            "fluc_rate": num(x.get("FLUC_RT")),
            "trade_value": num(x.get("ACC_TRDVAL")),
            "list_shares": shares,
            "net_asset": net_asset,
            "net_flow": flow,
            # 추적 지수 값 — 레버리지 · 인버스는 원지수 값으로 온다(마이그레이션 096). 커버드콜 · 레버리지 비교가 쓴다.
            "index_value": num(x.get("OBJ_STKPRC_IDX")),
        })
    return rows, shares_today


def usable_prev(prev_day: str | None, first_day: date) -> bool:
    """표에서 찾은 직전 거래일을 첫 날의 '직전'으로 써도 되나(MAX_GAP_DAYS 안쪽이어야 한다)."""
    if prev_day is None:
        return False
    return (first_day - date.fromisoformat(prev_day)).days <= MAX_GAP_DAYS


def stored_prev_shares(db, first_day: date) -> tuple[str | None, dict[str, float]]:
    """첫 날 바로 앞에 표에 있는 거래일과 그날의 {코드: 좌수}."""
    last = execute_with_retry(
        db.table(TABLE).select("trade_date").lt("trade_date", first_day.isoformat()).order("trade_date", desc=True).limit(1)
    ).data
    if not last:
        return None, {}
    prev_day = last[0]["trade_date"]
    return prev_day, stored_shares(db, prev_day)


def stored_shares(db, day: str) -> dict[str, float]:
    """표에 있는 그날의 {코드: 좌수}. 하루 1,172행이라 페이징한다(머리말 ⚠️ 넷째). 그날 행이 없으면 빈 dict."""
    out: dict[str, float] = {}
    start = 0
    while True:
        page = (
            execute_with_retry(
                db.table(TABLE)
                .select("isu_cd, list_shares")
                .eq("trade_date", day)
                .order("isu_cd")
                .range(start, start + 999)
            ).data
            or []
        )
        for r in page:
            if r["list_shares"] is not None:
                out[r["isu_cd"]] = float(r["list_shares"])
        if len(page) < 1000:
            break
        start += 1000
    return out


def refresh_year(db) -> None:
    """1년 합 뷰(마이그레이션 097)를 새로 고친다 — 화면의 기간 '1년'. 뷰가 아직 없으면(마이그레이션 전) 알리고 넘어간다.
    일별 표 쓰기는 이미 끝났으니 이 실패로 실행을 죽이지 않는다 — 1년 합만 하루 낡는다."""
    try:
        execute_with_retry(db.rpc("refresh_etf_flow_year"))
        print("[ETF] 1년 합(etf_flow_year)을 새로 고쳤습니다")
    except Exception as exc:  # noqa: BLE001
        print(f"[경고] etf_flow_year 를 못 새로 고쳤습니다(마이그레이션 097 확인): {exc}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=LOOKBACK_DAYS, help="다시 받을 달력 일수(처음 채울 땐 400)")
    ap.add_argument("--dry-run", action="store_true", help="DB 에 쓰지 않고 받을 날과 행 수만 찍는다")
    args = ap.parse_args()

    today = today_kst()
    days = list(business_days(today - timedelta(days=args.days - 1), today))
    db = get_client()
    try:
        prev_day, before = stored_prev_shares(db, days[0])
    except Exception as exc:  # noqa: BLE001 — 표가 없을 때(마이그레이션 전)를 알아보게 찍고 멈춘다
        print(f"[오류] {TABLE} 를 못 읽었습니다(마이그레이션 094 를 실행했는지 확인): {exc}")
        if not args.dry_run:
            sys.exit(1)
        # dry-run 은 표 없이도 받을 날과 행 수를 볼 수 있게 이어 간다(첫 날 순유입만 비는 것으로 끝난다).
        prev_day, before = None, {}
    if not usable_prev(prev_day, days[0]):
        if prev_day:
            print(f"[ETF] 표의 직전 거래일 {prev_day} 이 {days[0]} 보다 {MAX_GAP_DAYS}일 넘게 앞서 직전으로 안 씁니다")
        before = {}
    print(f"[ETF] {days[0]}~{days[-1]} 평일 {len(days)}일 · 직전 거래일 {prev_day if before else '없음'}")

    written = 0
    for day in days:
        bas_dd = day.strftime("%Y%m%d")
        res = krx_get(KRX_URL, bas_dd)
        if res is None:
            # 하루를 건너뛰고 다음 날로 가면 그 날 몫이 다음 날에 얹힌다. 멈추고 다음 실행에 맡긴다(이레를 다시 받는다).
            print(f"[중단] {day} KRX 호출 실패 — 남은 날은 다음 실행이 받습니다")
            break
        if res.status_code == 401:
            raise RuntimeError("KRX 401 — ETF 일별매매정보 승인이 풀렸다(만료일 확인)")
        res.raise_for_status()
        items = res.json().get("OutBlock_1") or []
        if not items or is_holiday(items):
            # 비어 온 날이 표엔 있으면(KRX 가 받아 둔 거래일을 비워 줌 · 머리말 ⚠️ 셋째) 그 좌수를 다음 날의 직전으로 쓴다.
            try:
                kept = stored_shares(db, day.isoformat())
            except Exception:  # noqa: BLE001 — dry-run 은 표 없이도 돈다
                kept = {}
            if kept:
                print(f"[ETF] {day} KRX 가 비워 줬지만 표에 {len(kept)}종목이 있습니다 — 표의 좌수를 다음 날의 직전으로 씁니다")
                before = kept
            else:
                print(f"[ETF] {day} 휴장 · 공표 전 — 건너뜁니다")
            continue
        rows, shares_today = parse_day(items, day.isoformat(), before)
        flows = sum(1 for r in rows if r["net_flow"] not in (None, 0))
        if args.dry_run:
            print(f"[dry-run] {day} {len(rows)}종목 · 좌수가 바뀐 종목 {flows}")
        else:
            for i in range(0, len(rows), CHUNK):
                execute_with_retry(db.table(TABLE).upsert(rows[i : i + CHUNK], on_conflict="trade_date,isu_cd"))
            print(f"[Supabase] {day} {len(rows)}종목 · 좌수가 바뀐 종목 {flows}")
        written += 1
        # 방금 받은 날이 다음 날의 '직전'이다.
        before = shares_today

    if written:
        if not args.dry_run:
            refresh_year(db)
        print(f"[ETF] 끝 — 쓴 날 {written}일{' · dry-run 이라 DB 에 안 썼습니다' if args.dry_run else ''}")
        return

    # ⚠️ "이번에 못 받았다"와 "표가 낡았다"는 다른 사건이다 — 잣대를 표의 최신 거래일로 둔다(fetch_seohak_etf.py 와 같다).
    newest = execute_with_retry(db.table(TABLE).select("trade_date").order("trade_date", desc=True).limit(1)).data
    if not newest:
        raise RuntimeError("ETF 자료를 하나도 못 받았고 표도 비어 있다")
    seen = date.fromisoformat(newest[0]["trade_date"])
    stale = (today - seen).days
    if stale <= STALE_ALERT_DAYS:
        print(f"[ETF] 새로 받은 날이 없습니다. 표는 {seen} 까지 있어 {stale}일 됐고 {STALE_ALERT_DAYS}일 안쪽이라 다음 실행이 만회합니다.")
        return
    raise RuntimeError(f"ETF 표가 {seen} 에 멈춰 {stale}일 됐다")


if __name__ == "__main__":
    main()
