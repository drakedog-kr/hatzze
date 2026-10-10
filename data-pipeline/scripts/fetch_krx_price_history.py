"""국장 일별 종가 이력 — KRX 일별매매정보를 날짜별로 받아 stock_price_daily 에 쌓는다.

종목 상세(`/stock/005930`)의 '커뮤니티 관심 추이'가 언급 막대 위에 같은 날의 종가 선을 겹친다.
`stocks` 는 가장 최근 하루치 종가만 들고 있어(fetch_krx_stocks.py) 날짜별 값을 따로 쌓는다.
화면은 야후를 부르지 않는다 — 까닭은 lib/stock-page.ts 머리말 ①.

엔드포인트는 fetch_krx_stocks.py 와 같다(stk_bydd_trd · ksq_bydd_trd). 날짜 하나에 그날 전 종목이
오므로 하루치가 호출 두 번이다. 지난 날짜도 그대로 받힌다(2026-10-10 실측).

## 빠진 날만 받는다

최근 WINDOW_DAYS 일의 평일 중 표에 없는 날만 받는다. 첫 실행이 기간을 통째로 채우고, 그 뒤로는
새로 공표된 하루씩 붙는다. 휴장일 · 아직 공표 전인 날(KRX 는 그날 종가를 다음 날 08:00 에 올린다)은
빈 응답이라 아무것도 안 쓰고 넘어간다 — 다음 실행이 다시 본다(코스피 한 번 0.2초).

⚠️ common/timeutil.days_to_backfill 을 쓰지 않는다. 그 함수는 표에 행이 하나라도 있으면 최근 15영업일만
   보는데, 첫 실행이 시간 상한에 걸려 최근 날부터 채우다 멈추면 그보다 오래된 빈 날이 영영 창 밖에 남는다.
   창이 45일이라 휴장일을 매번 다시 묻는 값(한 해 창이던 그 함수의 걱정거리)이 작다.

⚠️ 한 시장이라도 비면 그날은 통째로 안 쓴다(fetch_krx_stocks.py 와 같은 규칙). 코스피만 들어가면
   그날이 '있는 날'로 세져서 코스닥 종가가 영영 안 채워진다.
⚠️ KRX 호출이 한 번이라도 실패하면(재시도까지 소진) 거기서 멈춘다. 해외 러너가 KRX 에 막힌 날
   (403 물결)엔 남은 날도 같이 막히므로, 날마다 재시도 1분씩을 쌓아 잡을 늦추지 않는다.
   시간 상한(BUDGET_SEC)도 같은 뜻이다 — 이 스텝 뒤에서 배당 잡의 수집 스텝들이 기다린다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_krx_price_history.py
    python scripts/fetch_krx_price_history.py --dry-run   # 받을 날과 행 수만 찍는다(DB 에 안 쓴다)
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.krx_client import krx_get  # noqa: E402
from common.supabase_client import execute_with_retry, get_client  # noqa: E402
from common.timeutil import business_days, today_kst  # noqa: E402

KOSPI_URL = "http://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd"
KOSDAQ_URL = "http://data-dbg.krx.co.kr/svc/apis/sto/ksq_bydd_trd"
TABLE = "stock_price_daily"

# 채워 두는 달력 일수. 화면의 막대가 30일(lib/stock-page.ts STOCK_TREND_DAYS)이라 그보다 넉넉히.
WINDOW_DAYS = 45
# 한 실행의 시간 상한(초). 첫 실행 한 달치(영업일 29일 + 휴장 4일)가 국내에서 81초였다(2026-10-10 실측).
BUDGET_SEC = 240


def _to_int(value) -> int | None:
    """KRX 숫자 문자열('12,345')을 int로. 빈 값/파싱 실패는 None."""
    try:
        return int(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _to_float(value) -> float | None:
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def parse_rows(out_block: list[dict], day: str) -> list[dict]:
    """KRX OutBlock_1 → 표의 행. 코드나 종가가 없는 줄(거래 정지 등으로 비어 오는 값)은 뺀다."""
    rows: dict[str, dict] = {}
    for d in out_block:
        code = (d.get("ISU_CD") or "").strip()
        close = _to_int(d.get("TDD_CLSPRC"))
        if not code or not close:
            continue
        rows[code] = {"code": code, "date": day, "close": close, "change_rate": _to_float(d.get("FLUC_RT"))}
    return list(rows.values())


def fetch_day(bas_dd: str) -> list[dict] | None:
    """그날 두 시장의 OutBlock. 휴장 · 공표 전이면 빈 목록, **호출 실패면 None**(호출부가 멈춘다).

    코스피가 비면 코스닥은 안 부른다 — 휴장일마다 헛호출이 하나 준다.
    """
    out: list[dict] = []
    for url in (KOSPI_URL, KOSDAQ_URL):
        resp = krx_get(url, bas_dd)
        if resp is None:
            return None
        if resp.status_code != 200:
            print(f"[경고] {url.rsplit('/', 1)[-1]} {bas_dd}: HTTP {resp.status_code} {resp.text[:120]}")
            return None
        got = resp.json().get("OutBlock_1", [])
        if not got:
            if out:
                # 코스피는 왔는데 코스닥이 비었다 — 반쪽은 안 쓴다(머리말).
                print(f"[경고] {bas_dd} 코스닥이 비어 그날을 건너뜁니다(코스피 {len(out)}종목)")
            return []
        out.extend(got)
    return out


def stored_dates(db, days: list[date]) -> set[str]:
    """그중 표에 이미 있는 날. 날짜마다 행 수만 센다(행을 안 받는다 — 하루가 2,700행이다)."""
    have: set[str] = set()
    for d in days:
        res = execute_with_retry(db.table(TABLE).select("code", count="exact", head=True).eq("date", d.isoformat()))
        if res.count:
            have.add(d.isoformat())
    return have


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="DB 에 쓰지 않고 받을 날과 행 수만 찍는다")
    args = ap.parse_args()

    today = today_kst()
    db = get_client()
    window = list(business_days(today - timedelta(days=WINDOW_DAYS), today))
    try:
        existing = stored_dates(db, window)
    except Exception as exc:  # noqa: BLE001 — 표가 없을 때(마이그레이션 전)를 알아보게 찍고 멈춘다
        print(f"[오류] {TABLE} 를 못 읽었습니다(마이그레이션 093 을 실행했는지 확인): {exc}")
        sys.exit(1)

    # 최신부터 — 시간 상한에 걸리면 오래된 날이 다음 실행으로 밀리는 게 낫다(화면은 최근부터 본다).
    missing = [d for d in reversed(window) if d.isoformat() not in existing]
    print(f"[KRX] 표에 있는 날 {len(existing)}일 · 받을 날 {len(missing)}일")

    started = time.monotonic()
    written = skipped = 0
    for d in missing:
        if time.monotonic() - started > BUDGET_SEC:
            print(f"[중단] 시간 상한 {BUDGET_SEC}초 — 남은 {len(missing) - written - skipped}일은 다음 실행이 받습니다")
            break
        bas_dd = d.strftime("%Y%m%d")
        got = fetch_day(bas_dd)
        if got is None:
            print(f"[중단] {bas_dd} KRX 호출 실패 — 남은 날은 다음 실행이 받습니다")
            break
        rows = parse_rows(got, d.isoformat())
        if not rows:
            skipped += 1
            continue
        if args.dry_run:
            print(f"[dry-run] {d} {len(rows)}종목")
        else:
            db.table(TABLE).upsert(rows, on_conflict="code,date").execute()
            print(f"[Supabase] {d} {len(rows)}종목")
        written += 1

    print(f"[KRX] 끝 — 쓴 날 {written}일 · 빈 날(휴장 · 공표 전) {skipped}일{' · dry-run 이라 DB 에 안 썼습니다' if args.dry_run else ''}")


if __name__ == "__main__":
    main()
