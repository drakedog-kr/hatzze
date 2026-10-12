"""국내 상장 ETF 기본 정보(총보수 · 설정일 · 운용사 · 분류)를 `etf_info` 에 쌓는다 — '같은 지수, 어떤 ETF' 비교표의 재료.

원천은 예탁원 세이브로 'ETF종합정보'(BIP_CNTS06032V). 배당 화면의 분배금 수집(fetch_etf_dividends.py)과 같은 WebSquare 서비스로,
`callServletService.jsp` 에 XML 을 POST 하면 XML 로 답한다(로그인 · 세션 없음). ISIN 하나에 한 번이다.

    task    ksd.safe.bip.cnts.etf.process.EtfCompstInfoPTask
    action  compstInfoSecnDetailList
    인자    isin

## 응답 — 앞 칸만 읽는다

응답 맨 앞에 그 ETF 의 칸이 오고(ISIN · KOR_SECN_NM · TOT_RECM_RATE …), 뒤로 보유종목 TOP10 · 섹터 구성 같은 목록(`<data>`)이
이어진다. 목록에도 KOR_SECN_NM 이 들어 있어 응답 전체에서 첫 칸을 찾으면 맞지만 마지막 칸을 찾으면 보유종목 이름이 잡힌다
(2026-10-11 · KODEX 200 의 이름 자리에 '삼성물산'). 그래서 첫 `<data` 앞까지만 읽는다.

## ISIN 은 계산한다

KRX 일별매매정보는 단축코드만 준다. 국내 ETF ISIN 은 'KR7' + 단축코드 + '00' + 체크숫자이고, 체크숫자는 ISO 6166(글자를
36진 숫자로 펴서 룬 알고리즘)이다 — KR7069500007 · KR7360750004 · KR70094M0005 로 맞췄다.

## 세이브로에 없는 ETF

KRX 에 상장했어도 세이브로 'ETF종합정보'가 빈 응답(앞 칸 없음)을 주는 ETF 가 있다 — 2026-10-13 첫 정기 실행에서
0182R0(1Q K반도체TOP2+ · 4월 상장)과 0246X0(SOL 글로벌DRAM반도체플러스 · 10-07 상장)이 그랬다. ISIN 은 KRX 종목 찾기의
full_code 와 같다(KR70182R0003 · KR70246X0009). 받을 것이 그 둘뿐이라 2/2 로 실패 비율 문턱을 넘어 죽었고(이슈 #723),
둘이 저쪽에 오를 때까지 매 실행 알림이 설 판이었다. 그래서 실패가 나오면 늘 있는 KODEX 200(CANARY)을 한 번 더 받아 본다 —
읽히면 실패는 저쪽에 그 종목이 없는 것이라 경고만 찍고 지나가고, 안 읽히면 저쪽 화면이 바뀐 것이라 죽는다. 비율 문턱은
FAIL_MIN 개 이상 실패했을 때만 본다(끊김이 몰린 날). 못 받은 ETF 는 표에 없어 화면이 이름 규칙으로 유형을 정하고
총보수 · 운용사 · 상장일을 '없음'으로 둔다. 다음 실행이 다시 걸어 본다.

## 며칠마다 다시 받나

총보수 · 설정일은 거의 안 바뀐다. 매 실행 표에 없거나 REFRESH_DAYS 넘게 묵은 것만, 한 번에 MAX_CALLS 까지 받는다.
1,172종목을 한 바퀴 도는 데 0.3초 쉼 포함 10분 안쪽이다. 처음엔 `--all` 로 통째로 받는다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_etf_info.py            # 묵은 것만
    python scripts/fetch_etf_info.py --all      # 처음 채울 때
    python scripts/fetch_etf_info.py --dry-run  # 받을 종목 수와 앞 다섯만 찍는다(DB 에 안 쓴다)
"""

from __future__ import annotations

import argparse
import html
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.supabase_client import execute_with_retry, get_client  # noqa: E402

TABLE = "etf_info"
URL = "https://seibro.or.kr/websquare/engine/proworks/callServletService.jsp"
SRC = "https://seibro.or.kr/websquare/control.jsp?w2xPath=/IPORTAL/user/etf/BIP_CNTS06032V.xml&menuNo=180"
HEADERS = {
    "User-Agent": "hatzze/1.0 (+https://hatzze.fun; contact: support@hatzze.fun)",
    "Referer": SRC,
    "Content-Type": "application/xml; charset=UTF-8",
}
TASK = "ksd.safe.bip.cnts.etf.process.EtfCompstInfoPTask"
ACTION = "compstInfoSecnDetailList"
PAUSE_SEC = 0.3
REFRESH_DAYS = 7
MAX_CALLS = 400
CHUNK = 500
# 이만큼 넘게 실패하면 저쪽 화면이 바뀐 것이다 — 조용히 넘어가지 말고 죽는다. 실패가 FAIL_MIN 보다 적으면 비율을 안 본다(머리말 '세이브로에 없는 ETF').
FAIL_RATIO_LIMIT = 0.2
FAIL_MIN = 10
# 늘 있는 ETF(KODEX 200) — 실패가 나오면 이것도 받아 본다. 이게 읽히면 실패는 저쪽에 그 종목이 없는 것이다.
CANARY = "069500"


def isin_check_digit(body: str) -> str:
    """ISO 6166 체크숫자 — 글자는 36진 숫자(A=10 … Z=35)로 펴고, 오른쪽부터 한 칸 걸러 두 배 해 자릿수를 더한다."""
    digits = "".join(str(int(c, 36)) for c in body)
    total = 0
    for i, d in enumerate(reversed(digits)):
        n = int(d) * (2 if i % 2 == 0 else 1)
        total += n // 10 + n % 10
    return str((10 - total % 10) % 10)


def to_isin(code: str) -> str:
    body = f"KR7{code}00"
    return body + isin_check_digit(body)


def parse_info(xml: str) -> dict[str, str]:
    """응답의 앞 칸(첫 목록 `<data` 앞) → {칸 이름: 값}. 목록 안의 같은 이름 칸은 읽지 않는다(머리말)."""
    head = xml.split("<data", 1)[0]
    return {k: html.unescape(v) for k, v in re.findall(r'<([A-Z0-9_]+) value="([^"]*)"', head)}


def to_row(code: str, info: dict[str, str]) -> dict | None:
    """세이브로 칸 → 표의 행. 이름이 없으면(없는 ISIN · 상장폐지) None."""
    name = (info.get("KOR_SECN_NM") or "").strip()
    if not name:
        return None
    fee = info.get("TOT_RECM_RATE", "").strip()
    setup = info.get("SETUP_DT", "").strip()
    return {
        "code": code,
        "isin": info.get("ISIN") or to_isin(code),
        "name": name,
        "manager": (info.get("MNGCO_ACOPNO_NM") or "").strip() or None,
        "fee_pct": float(fee) if re.fullmatch(r"\d*\.?\d+", fee) else None,
        "setup_date": f"{setup[:4]}-{setup[4:6]}-{setup[6:8]}" if re.fullmatch(r"\d{8}", setup) else None,
        "category": (info.get("ETF_BIG_SORT_NM") or "").strip() or None,
        "benchmark": (info.get("MNGCO_STD_FUND_BCHMRK_CONTENT") or "").strip() or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def fetch_info(isin: str) -> dict[str, str] | None:
    body = (
        f'<reqParam action="{ACTION}" task="{TASK}"><isin value="{isin}"/>'
        '<MENU_NO value="180"/><W2XPATH value="/IPORTAL/user/etf/BIP_CNTS06032V.xml"/></reqParam>'
    )
    for attempt in range(3):
        try:
            req = urllib.request.Request(URL, data=body.encode("utf-8"), headers=HEADERS)
            with urllib.request.urlopen(req, timeout=40) as r:
                return parse_info(r.read().decode("utf-8", "ignore"))
        except Exception as exc:  # noqa: BLE001 — 끊김 · 타임아웃은 두 번 더 걸어 본다
            if attempt == 2:
                print(f"[경고] {isin} 세이브로 실패: {exc}")
            time.sleep(1 + attempt)
    return None


def page_all(db, build) -> list[dict]:
    out: list[dict] = []
    start = 0
    while True:
        page = execute_with_retry(build().range(start, start + 999)).data or []
        out.extend(page)
        if len(page) < 1000:
            return out
        start += 1000


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="묵었든 아니든 지금 상장된 ETF 를 전부 받는다")
    ap.add_argument("--dry-run", action="store_true", help="DB 에 쓰지 않고 받을 종목 수와 앞 다섯만 찍는다")
    ap.add_argument("--limit", type=int, default=0, help="이번에 받을 종목 수 상한(점검용)")
    args = ap.parse_args()

    db = get_client()
    latest = execute_with_retry(db.table("etf_flow_daily").select("trade_date").order("trade_date", desc=True).limit(1)).data
    if not latest:
        raise RuntimeError("etf_flow_daily 가 비어 있다 — fetch_etf_flows.py 가 먼저 돌아야 한다")
    day = latest[0]["trade_date"]
    codes = [r["isu_cd"] for r in page_all(db, lambda: db.table("etf_flow_daily").select("isu_cd").eq("trade_date", day).order("isu_cd"))]

    try:
        have = {r["code"]: r["updated_at"] for r in page_all(db, lambda: db.table(TABLE).select("code,updated_at").order("code"))}
    except Exception as exc:  # noqa: BLE001 — 표가 없을 때(마이그레이션 전)
        print(f"[오류] {TABLE} 를 못 읽었습니다(마이그레이션 095 를 실행했는지 확인): {exc}")
        if not args.dry_run:
            sys.exit(1)
        have = {}
    cutoff = datetime.now(timezone.utc) - timedelta(days=REFRESH_DAYS)

    def stale(code: str) -> bool:
        t = have.get(code)
        return t is None or datetime.fromisoformat(t.replace("Z", "+00:00")) < cutoff

    todo = codes if args.all else [c for c in codes if stale(c)][:MAX_CALLS]
    if args.limit:
        todo = todo[: args.limit]
    print(f"[세이브로] {day} 상장 {len(codes)}종목 · 표에 {len(have)}종목 · 받을 것 {len(todo)}종목")

    rows: list[dict] = []
    missed: list[str] = []
    for i, code in enumerate(todo, 1):
        info = fetch_info(to_isin(code))
        row = to_row(code, info) if info is not None else None
        if row is None:
            missed.append(code)
        else:
            rows.append(row)
            if args.dry_run and len(rows) <= 5:
                print(f"[dry-run] {row['code']} {row['name']} · 보수 {row['fee_pct']}% · {row['manager']} · {row['category']}")
        if i % 100 == 0:
            print(f"[세이브로] {i}/{len(todo)} · 실패 {len(missed)}")
        time.sleep(PAUSE_SEC)

    failed = len(missed)
    if failed:
        print(f"[경고] 세이브로에서 못 받은 {failed}종목: {' · '.join(missed[:20])}{' …' if failed > 20 else ''}")
        probe = fetch_info(to_isin(CANARY))
        if probe is None or to_row(CANARY, probe) is None:
            raise RuntimeError(f"세이브로 ETF종합정보 실패 {failed}/{len(todo)} · KODEX 200 도 못 읽었다 — 화면 구조가 바뀌었는지 볼 것")
        print("[세이브로] KODEX 200 은 읽힌다 — 못 받은 종목은 저쪽에 없는 것으로 보고 넘어갑니다")
    if failed >= FAIL_MIN and failed / len(todo) > FAIL_RATIO_LIMIT:
        raise RuntimeError(f"세이브로 ETF종합정보 실패 {failed}/{len(todo)} — 끊김이 몰렸거나 화면 구조가 바뀌었는지 볼 것")
    if args.dry_run:
        print(f"[dry-run] 받은 {len(rows)} · 실패 {failed} · DB 에 안 썼습니다")
        return
    for i in range(0, len(rows), CHUNK):
        execute_with_retry(db.table(TABLE).upsert(rows[i : i + CHUNK], on_conflict="code"))
    print(f"[Supabase] {TABLE} {len(rows)}종목 · 실패 {failed}")


if __name__ == "__main__":
    main()
