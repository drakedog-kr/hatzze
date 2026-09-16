"""예탁결제원 배당 기록(공공데이터포털 금융위원회_주식배당정보)을 `kr_dividend` 에 upsert.

배당주 페이지(성향별 바스켓 + 보유 종목 계산기)의 재료다. 종목별 최근 12개월 배당금·증가율·
연속 배당 연수·"어느 달에 입금되나"가 전부 이 표에서 나온다. 현재가는 `stocks.close_price`
(fetch_krx_stocks.py, KRX 전일 종가)를 그대로 쓴다 — 종가 이력은 안 쌓는다.

## 원천

    https://apis.data.go.kr/1160100/GetStocDiviInfoService_V2/getDiviInfo_V2

⚠️ 주소에 `/service/` 가 없고 끝에 `_V2` 가 붙는다 — fetch_seohak_settlement.py 와 같은 함정.
   `getDiviInfo`(V2 없이)는 NO_OPENAPI_SERVICE 를 낸다.

## ⚠️⚠️ 날짜별 증분이 아니라 **매일 스냅숏 하나**를 통째로 준다

`basDt` 는 최신 영업일 하나만 값이 있고(2026-09-11 실측: 20260910 에 71,683행), 옛 날짜를
넣으면 0행이다. 그래서 이 스크립트는 **매일 전량**을 5,000행씩 15페이지로 받아 upsert 한다.
7만 행이라 30초쯤이고 하루 한도(1만 회)의 0.2% 다.

## ⚠️⚠️ 1주당 금액 칸은 명목값이다. 액면분할이 소급되지 않는다

`stckGenrDvdnAmt` 는 **당시 액면 기준**이라 삼성전자 2017년 결산이 21,500원으로 온다.
반면 `stckGenrCashDvdnRt`(배당률, 당시 액면 대비 %) × `stckParPrc`(**지금** 액면) ÷ 100 은
분할이 소급된 값이다(같은 행에서 100 × 430 ÷ 100 = 430원 = 21,500 ÷ 50). 그래서
`cash_per_share` 는 이 계산값이고 명목값은 `cash_per_share_nominal` 로 따로 둔다.
1990년대 행은 아예 금액이 0 이고 배당률만 있어서(현금배당 40,690행 중 11,109행), 계산값이
아니면 이력이 끊긴다. 액면가가 0 인 발행사(215행)만 명목값으로 메운다.

## 단축코드는 ISIN 에서 유도한다

KRX 종목기본정보(stk_isu_base_info)는 우리 키에 승인이 없다(401). 대신 규칙으로 푼다 —
앞 5자리는 그대로, 6번째 자리는 0→0(보통주)·1→5(1우선주)·2→7·3→9, 영문(K·L·M)은 그대로.
2026-09-11 에 `stocks` 표와 맞대어 상장 보통주·우선주가 전부 맞았다(CJ4우(전환)=00104K 포함).
못 맞춘 우선주는 비상장·상장폐지분이었다(하이트진로1우 등). 4우선주 이상은 표본이 없어
검증 못 했고 그대로 둔다 — 보통주 코드는 늘 0 으로 끝나 충돌은 안 난다.

## 상장 여부를 안 가리고 다 담는다

비상장 발행사가 섞여 있지만(스팩·비상장 리츠·옛 기업) 7만 행이라 작고, 상장폐지된 종목의
이력도 남는다. 화면은 `stocks` 와 join 해 상장분만 쓴다.

## 원천에서 사라진 행

전량을 다시 받으므로 원천이 지운 행(정정)은 upsert 로는 안 지워진다. 그래서 **전량을 다
받은 실행에서만** 이번 스냅숏에 안 실린 행을 지운다. 사라진 행이 전체의 1% 를 넘으면
원천 사고로 보고 지우지 않고 죽는다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_kr_dividends.py --dry-run   # 받아서 요약만, DB 안 씀
    python scripts/fetch_kr_dividends.py
"""

from __future__ import annotations

import sys
import time
from collections import Counter
from datetime import date
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.config import KSD_API_KEY  # noqa: E402
from common.retry import backoff_delay  # noqa: E402
from common.supabase_client import get_client, load_all  # noqa: E402

ENDPOINT = (
    "https://apis.data.go.kr/1160100/GetStocDiviInfoService_V2/getDiviInfo_V2"
)
TABLE = "kr_dividend"
# (연결, 읽기). 5,000행 한 페이지가 2MB 쯤이라 읽기는 넉넉히 둔다.
REQUEST_TIMEOUT_SEC = (10, 90)
MAX_RETRIES = 4
PAGE_ROWS = 5000
# 페이지 수 상한. 71,683행이면 15페이지다. 원천이 몇 배로 불어도 넉넉하고, 페이징이
# 망가져 같은 페이지를 되풀이해도 여기서 멈춘다.
MAX_PAGES = 60
CHUNK = 500
# 표가 이만큼(달력일) 낡아야 알람을 켠다. 하루 실패는 다음 실행이 만회한다.
STALE_ALERT_DAYS = 8
# 원천에서 사라진 행이 이 비율을 넘으면 지우지 않고 죽는다(원천 쪽 사고로 본다).
VANISH_ABORT_RATIO = 0.01

# ISIN 6번째 자리 → 단축코드 끝자리. 4 이상은 검증 표본이 없어 그대로 둔다.
_CODE_SUFFIX = {"0": "0", "1": "5", "2": "7", "3": "9"}


class Unreachable(RuntimeError):
    """원천을 못 받았다."""


def isin_to_code(isin: str) -> str:
    """KR7005931001 → 005935. 규칙은 모듈 머리말 참고."""
    body = isin[3:9]
    return body[:5] + _CODE_SUFFIX.get(body[5], body[5])


assert isin_to_code("KR7005930003") == "005930"  # 삼성전자
assert isin_to_code("KR7005931001") == "005935"  # 삼성전자우
assert isin_to_code("KR7005382007") == "005387"  # 현대차2우B
assert isin_to_code("KR7005383005") == "005389"  # 현대차3우B
assert isin_to_code("KR702826K016") == "02826K"  # 삼성물산우B


def fetch_page(page: int) -> tuple[list[dict], int]:
    """한 페이지의 행 목록과 원천이 말하는 총 건수."""
    params = {
        "serviceKey": KSD_API_KEY,
        "resultType": "json",
        "numOfRows": PAGE_ROWS,
        "pageNo": page,
    }
    last: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            res = requests.get(ENDPOINT, params=params, timeout=REQUEST_TIMEOUT_SEC)
            res.raise_for_status()
            payload = res.json()
            # 키 미등록·서비스 없음은 `response` 가 아니라 `OpenAPI_ServiceResponse` 로 온다.
            if "response" not in payload:
                head = payload.get("OpenAPI_ServiceResponse", {}).get("cmmMsgHeader", {})
                raise RuntimeError(
                    f"원천 오류 {head.get('errMsg')} — {head.get('returnAuthMsg')} "
                    "(활용신청이 풀렸거나 주소가 바뀐 것이다. 재시도해도 안 바뀐다)"
                )
            body = payload["response"]["body"]
            total = int(body.get("totalCount") or 0)
            item = (body.get("items") or {}).get("item") or []
            return (item if isinstance(item, list) else [item]), total
        except RuntimeError:
            raise
        except Exception as exc:  # noqa: BLE001
            last = exc
            if attempt + 1 >= MAX_RETRIES:
                break
            delay = backoff_delay(attempt + 1, base_sec=2, max_sec=15)
            print(f"[예탁원 배당] {page}페이지 조회 실패({exc}) — {delay:.0f}초 뒤 재시도")
            time.sleep(delay)
    raise Unreachable(f"{page}페이지 조회 실패: {last}")


def fetch_all() -> tuple[list[dict], int]:
    """전량. (받은 행, 원천 총 건수). 페이지 하나가 끝내 안 오면 거기서 멈추고 부분만 준다."""
    rows: list[dict] = []
    total = 0
    for page in range(1, MAX_PAGES + 1):
        try:
            items, total = fetch_page(page)
        except Unreachable as exc:
            print(f"[예탁원 배당] {exc} — 여기까지 받은 {len(rows)}행만 씁니다")
            break
        rows.extend(items)
        print(f"[예탁원 배당] {page}페이지 {len(items)}행 (누적 {len(rows):,} / {total:,})")
        if not items or len(rows) >= total:
            break
    return rows, total


def _ymd(s: str | None) -> str | None:
    s = (s or "").strip()
    return f"{s[:4]}-{s[4:6]}-{s[6:]}" if len(s) == 8 else None


def _num(s: str | None) -> float | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def to_row(x: dict) -> dict | None:
    isin = (x.get("isinCd") or "").strip()
    record_date = _ymd(x.get("dvdnBasDt"))
    if len(isin) != 12 or not record_date:
        return None
    kind = (x.get("stckDvdnRcdNm") or "").strip() or "알수없음"
    nominal = _num(x.get("stckGenrDvdnAmt")) or 0.0
    rate = _num(x.get("stckGenrCashDvdnRt")) or 0.0
    par = _num(x.get("stckParPrc")) or 0.0
    # 분할 소급값이 우선이다(머리말). 액면가가 0 이면 명목값으로 메운다.
    if par > 0 and rate > 0:
        cash = round(par * rate / 100, 4)
    else:
        cash = nominal
    return {
        "isin": isin,
        "record_date": record_date,
        "code": isin_to_code(isin),
        "issuer_name": (x.get("stckIssuCmpyNm") or "").strip() or "(이름 없음)",
        "security_name": (x.get("isinCdNm") or "").strip() or None,
        "share_kind": (x.get("scrsItmsKcdNm") or "").strip() or None,
        "kind": kind,
        "cash_per_share": cash,
        "cash_per_share_nominal": nominal,
        "cash_rate_pct": rate,
        "par_value": par,
        "stock_dividend_ratio": _num(x.get("stckGenrDvdnRt")) or 0.0,
        "pay_date": _ymd(x.get("cashDvdnPayDt")),
        "stock_delivery_date": _ymd(x.get("stckHndvDt")),
        "fiscal_month": (x.get("stckStacMd") or "").strip() or None,
        "diff_cash_rate_pct": _num(x.get("cashGrdnDvdnRt")) or 0.0,
        "snapshot_date": _ymd(x.get("basDt")) or date.today().isoformat(),
    }


def newest_snapshot(db) -> date | None:
    res = (
        db.table(TABLE)
        .select("snapshot_date")
        .order("snapshot_date", desc=True)
        .limit(1)
        .execute()
    )
    return date.fromisoformat(res.data[0]["snapshot_date"]) if res.data else None


def summarize(rows: list[dict], listed: set[str]) -> None:
    kinds = Counter(r["kind"] for r in rows)
    latest = max(r["record_date"] for r in rows)
    recent = [r for r in rows if r["record_date"] >= "2024-01-01"]
    hit = sum(1 for r in recent if r["code"] in listed)
    print(
        f"  종류: " + " · ".join(f"{k} {n:,}" for k, n in kinds.most_common())
        + f" · 최신 기준일 {latest}"
    )
    print(
        f"  2024년 이후 {len(recent):,}행 중 상장 종목(stocks)과 이어진 행 {hit:,}"
        f" ({hit / max(len(recent), 1) * 100:.0f}%) — 나머지는 비상장·상장폐지분"
    )
    # 계산값이 명목값과 크게 갈린 행 = 액면분할이 있었던 발행사. 규칙이 살아 있다는 표시.
    split = [
        r for r in rows
        if r["kind"] == "현금배당" and r["cash_per_share_nominal"] > 0
        and abs(r["cash_per_share"] - r["cash_per_share_nominal"]) > 1
    ]
    print(f"  분할 소급으로 명목값과 달라진 행 {len(split):,}")
    for r in sorted((r for r in rows if r["code"] == "005930" and r["share_kind"] == "보통주"),
                    key=lambda r: r["record_date"])[-3:]:
        print(
            f"  삼성전자 {r['record_date']} {r['kind']} {r['cash_per_share']:,.0f}원"
            f"{' 지급 ' + r['pay_date'] if r['pay_date'] else ''}"
        )


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    if not KSD_API_KEY:
        print("[예탁원 배당] KSD_API_KEY 없음 — 건너뜁니다")
        sys.exit(1)

    raw, total = fetch_all()
    db = get_client()

    if not raw:
        # "못 받았다"와 "표가 낡았다"는 다른 사건이다 — fetch_seohak_settlement.py 와 같은 잣대.
        newest = newest_snapshot(db)
        if newest is None:
            raise RuntimeError("배당 자료를 하나도 못 받았고 표도 비어 있다")
        stale = (date.today() - newest).days
        if stale <= STALE_ALERT_DAYS:
            print(
                f"[예탁원 배당] 새로 받은 게 없습니다. 표는 {newest} 스냅숏까지 있어 "
                f"{stale}일 됐고 {STALE_ALERT_DAYS}일 안쪽이라 다음 실행이 만회합니다."
            )
            return
        raise RuntimeError(f"배당 자료를 하나도 못 받았고 표가 {newest} 에서 {stale}일 멈춰 있다")

    rows: list[dict] = []
    skipped = 0
    for x in raw:
        r = to_row(x)
        if r is None:
            skipped += 1
            continue
        rows.append(r)
    # (isin, 기준일) 이 유일하다(2026-09-11 전량 실측 0중복). 깨지면 upsert 가 같은 요청 안에서
    # 같은 키를 두 번 만나 죽으므로 여기서 먼저 알아챈다.
    dup = len(rows) - len({(r["isin"], r["record_date"]) for r in rows})
    if dup:
        raise RuntimeError(f"(isin, record_date) 중복 {dup}건 — 원천 구조가 바뀌었다")
    complete = len(raw) >= total > 0
    snapshot = max(r["snapshot_date"] for r in rows)
    listed = {r["code"] for r in load_all(db, "stocks", "code", order_by="code")}

    print(
        f"[예탁원 배당] {len(rows):,}행 정리 (원천 {total:,} · 건너뜀 {skipped} · "
        f"스냅숏 {snapshot} · {'전량' if complete else '⚠️ 일부'})"
    )
    summarize(rows, listed)
    if dry_run:
        print("[예탁원 배당] --dry-run: DB 에 쓰지 않았습니다")
        return

    for i in range(0, len(rows), CHUNK):
        db.table(TABLE).upsert(rows[i : i + CHUNK], on_conflict="isin,record_date").execute()
    print(f"[Supabase] {TABLE} upsert 완료: {len(rows):,}행")

    if not complete:
        print("  ⚠️ 전량이 아니라 사라진 행 정리는 건너뜁니다")
        return
    # 이번 스냅숏에 안 실린 행 = 원천이 지운 것. 너무 많으면 원천 사고라 지우지 않는다.
    stale_rows = (
        db.table(TABLE)
        .select("isin", count="exact")
        .lt("snapshot_date", snapshot)
        .limit(1)
        .execute()
    )
    vanished = stale_rows.count or 0
    if vanished == 0:
        return
    if vanished > len(rows) * VANISH_ABORT_RATIO:
        raise RuntimeError(
            f"이번 스냅숏에 없는 행이 {vanished:,}건({vanished / len(rows) * 100:.1f}%) — "
            "원천 쪽 사고로 보고 지우지 않았다"
        )
    db.table(TABLE).delete().lt("snapshot_date", snapshot).execute()
    print(f"  원천에서 사라진 행 {vanished}건을 지웠습니다")


if __name__ == "__main__":
    main()
