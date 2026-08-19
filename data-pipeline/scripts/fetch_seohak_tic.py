"""미 재무부 TIC(Treasury International Capital)에서 나라별 미국 증권 보유·순매수를
받아 `seohak_country_flows` 에 upsert. **서학개미 해부도의 뼈대다.**

## 이 표가 없으면 화면 절반이 죽는다

'원화로 보면'·'얼마나 오래 들고 있나' 두 카드는 예탁원 유입을 **합성지수**로 굴려
지금 값을 낸다. 그 지수가 이 표에서 나온다 — `(잔고 − 앞잔고 − 순매수) ÷ 앞잔고` 로
한국인이 든 미국 주식의 내재 수익률을 월별로 이어 붙인 것이다(`lib/seohak-data.ts`
의 `buildIndex`). 그래서 **이 표가 멈추면 그 두 카드의 기준일도 같이 멈춘다.**

⚠️⚠️ 실제로 멈춰 있었다. 2026-08-19 에 확인하니 표의 마지막 달이 **2026-05** 로
110일 묵어 있었고(수집 스크립트가 아예 없었다), 예탁원 자료는 2026-08-14 까지
있는데 화면은 5월 말 값을 내고 있었다. 그 사이 순매수 $5.9B 가 통째로 빠졌다.

## ⚠️⚠️ 과거를 **다시 쓴다**. 새 달만 넣으면 안 된다

재무부는 발표할 때마다 앞 달을 **수정한다.** 실측(2026-08-19):

    2026-05 잔고   DB 814,605  ←  이번 파일 815,566   (+961)
    2026-05 평가변동 DB  52,167  ←  이번 파일  51,258   (−909)

2026-04·03·02 는 다섯 칸이 전부 일치했으므로 매핑은 맞고, **5월만 갱신된 것**이다.
그래서 매번 전 기간(498개월 × 7개국)을 통째로 upsert 한다. 3,500행이라 비용도 없다.

## 원천

`https://ticdata.treasury.gov/Publish/cslt.zip` — 8.8MB zip 안에 `cslt.json` 하나가
들어 있고(120MB), 그 안에 4,260개 계열이 있다. 키가 규칙적이라 나라 코드만 갈아
끼우면 된다.

    for_lt_eqty_pos_43001      한국인이 든 미국 주식 잔액
    for_lt_eqty_net_43001      그 달 순매수
    for_lt_eqty_valchg_43001   그 달 평가변동
    us_lt_eqty_pos_43001       역방향 — 미국인이 든 한국 주식 잔액
    us_lt_eqty_net_43001       역방향 순매수

⚠️ 단위는 **백만 달러**다(`Millions of Dollars`). 표의 칸 이름이 `_usd_mn` 인 이유다.
⚠️ `observations` 는 `[["2026-06-01","813432.0"], ...]` 꼴이고 **최신이 앞**이다.
값은 문자열이며 소수점이 붙어 오므로 float 를 거쳐 int 로 내린다.
⚠️ 잔액 계열만 499개월이고 순매수·평가변동은 498개월이다(첫 달은 증감이 없다).
빠진 달은 None 으로 둔다 — 0 으로 채우면 "그 달 순매수가 없었다"가 되어 지수가
틀어진다.

## ⚠️ 압축을 풀어 메모리에 올린다

120MB JSON 이라 러너 메모리를 그만큼 쓴다. 스트리밍 파서를 쓸 수도 있지만, 이
워크플로가 이미 텔레그램 11만 행을 다루므로 그 정도는 여유가 있다고 봤다. 대신
필요한 35개 계열만 뽑고 나머지는 바로 버린다.
"""

from __future__ import annotations

import io
import json
import sys
import time
import zipfile
from datetime import date
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.retry import backoff_delay  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

CSLT_URL = "https://ticdata.treasury.gov/Publish/cslt.zip"
# ⚠️ 미 정부 사이트는 UA 를 안 보내면 막는 곳이 있다(SEC 가 그렇다). 연락처를 밝힌다.
USER_AGENT = "hatzze-pipeline/1.0 (contact: hatzze@proton.me)"
REQUEST_TIMEOUT_SEC = 120
MAX_RETRIES = 4

# 표에 이미 든 나라들. 늘리려면 여기만 고치면 되고, 계열 키는 코드로 만들어진다.
# 13005 캐나다 · 41408 중국 · 42005 홍콩 · 42609 일본 · 43001 한국 · 46019 싱가포르 · 46302 대만
COUNTRIES = ["13005", "41408", "42005", "42609", "43001", "46019", "46302"]

# 표의 칸 ← 계열 접두. 나라 코드를 뒤에 붙이면 source_id 가 된다.
SERIES = {
    "holdings_usd_mn": "for_lt_eqty_pos",
    "net_purchase_usd_mn": "for_lt_eqty_net",
    "valuation_change_usd_mn": "for_lt_eqty_valchg",
    "us_holdings_usd_mn": "us_lt_eqty_pos",
    "us_net_purchase_usd_mn": "us_lt_eqty_net",
}

# ⚠️ Supabase 는 한 번에 다 받으면 statement timeout 에 걸린다. 이 저장소의 다른
# 쓰기가 전부 500행씩 쪼개는 것과 같은 이유다.
CHUNK = 500
# 내려받기가 막혔을 때, 표가 이만큼(달력일) 안 갱신됐어야 알람을 켠다.
# ⚠️ 재무부 자료가 **몇 달 된 것**이라 "가장 최근 달"로는 신선도를 못 잰다(늘 낡았다).
#    그래서 `updated_at` 즉 **마지막으로 성공한 실행**을 본다. 월 단위 자료라
#    하루이틀 못 받는 건 아무 손해가 없다.
STALE_ALERT_DAYS = 7


class Unreachable(RuntimeError):
    """cslt.zip 을 못 받았다. 표가 낡았을 때만 알람이 된다."""


def download_cslt() -> dict:
    """cslt.zip 을 받아 안의 JSON 을 돌려준다."""
    last: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            res = requests.get(
                CSLT_URL, timeout=REQUEST_TIMEOUT_SEC, headers={"User-Agent": USER_AGENT}
            )
            res.raise_for_status()
            with zipfile.ZipFile(io.BytesIO(res.content)) as z:
                name = z.namelist()[0]
                print(f"[TIC] {len(res.content) / 1e6:.1f}MB 내려받음 → {name}")
                with z.open(name) as f:
                    return json.load(f)
        except Exception as exc:  # noqa: BLE001 — 재시도 후 호출자가 판단한다
            last = exc
            # ⚠️ 마지막 시도 뒤에는 안 잔다. 백오프가 3·6·12·24 라 네 번째 실패 뒤에도
            #    24초를 자고 나서 예외를 던지고 있었다. 레포의 다른 재시도 루프
            #    아홉 곳은 전부 `if attempt < MAX` 로 이걸 거른다.
            if attempt + 1 >= MAX_RETRIES:
                break
            delay = backoff_delay(attempt + 1, base_sec=3, max_sec=30)
            print(f"[TIC] 내려받기 실패({exc}) — {delay:.0f}초 뒤 재시도")
            time.sleep(delay)
    raise Unreachable(f"cslt.zip 내려받기 실패: {last}")


def last_success(db) -> date | None:
    """마지막으로 이 표에 성공적으로 쓴 날. 내려받기가 막혔을 때 알람을 켤 잣대다."""
    res = (
        db.table("seohak_country_flows")
        .select("updated_at")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    return date.fromisoformat(res.data[0]["updated_at"][:10]) if res.data else None


def main() -> None:
    try:
        doc = download_cslt()
    except Unreachable as exc:
        # ⚠️ 하루 못 받는 것은 사건이 아니다. 이 자료는 **한 달에 한 번** 바뀌므로
        #    어제 받은 것과 오늘 받을 것이 같다. 그런데도 실패로 끝내면 알림 이슈가
        #    열리고, 그런 알람은 며칠이면 아무도 안 보게 된다.
        #    ⭐ 신선도는 '자료의 달'이 아니라 **마지막 성공 실행**으로 잰다 — 재무부
        #    자료는 원래 몇 달 된 것이라 달로 재면 늘 낡았다고 나온다.
        db = get_client()
        seen = last_success(db)
        if seen is None:
            raise
        stale = (date.today() - seen).days
        if stale <= STALE_ALERT_DAYS:
            print(
                f"[TIC] 내려받기 실패({exc}). 표는 {seen} 에 채워져 {stale}일 됐고 "
                f"{STALE_ALERT_DAYS}일 안쪽이라 다음 실행이 만회합니다."
            )
            return
        raise RuntimeError(
            f"cslt.zip 을 못 받았고 표가 {seen} 이후 {stale}일 안 갱신됐다"
        ) from exc
    print(f"[TIC] release {doc.get('releaseID')} · {doc.get('transmissionDt')}")

    wanted = {
        f"{prefix}_{code}": (code, col)
        for col, prefix in SERIES.items()
        for code in COUNTRIES
    }
    # source_id → {month: value}. 필요한 계열만 뽑고 나머지 4,200여 개는 버린다.
    picked: dict[str, dict[str, float]] = {}
    for s in doc.get("series", []):
        sid = s.get("source_id")
        if sid in wanted:
            picked[sid] = dict(s.get("observations", []))
    missing = sorted(set(wanted) - set(picked))
    if missing:
        # 계열 이름이 바뀌면 조용히 빈 표가 되는 게 가장 나쁘다. 죽여서 알린다.
        raise RuntimeError(f"TIC 계열을 못 찾음({len(missing)}개): {missing[:5]}")

    rows: list[dict] = []
    for code in COUNTRIES:
        months = sorted(picked[f"for_lt_eqty_pos_{code}"])
        for month in months:
            row: dict[str, object] = {"country_code": code, "month": month}
            for col, prefix in SERIES.items():
                v = picked[f"{prefix}_{code}"].get(month)
                # ⚠️ 없는 달은 None. 0 으로 채우면 "그 달 순매수가 없었다"가 되어
                # 합성지수가 틀어진다.
                row[col] = None if v is None else int(float(v))
            rows.append(row)

    db = get_client()
    for i in range(0, len(rows), CHUNK):
        db.table("seohak_country_flows").upsert(
            rows[i : i + CHUNK], on_conflict="country_code,month"
        ).execute()

    latest = max(r["month"] for r in rows)
    print(f"[Supabase] seohak_country_flows upsert 완료: {len(rows)}행 · 최신 {latest}")
    for code in COUNTRIES:
        kr = [r for r in rows if r["country_code"] == code]
        print(f"  {code}: {len(kr)}개월 (~{max(r['month'] for r in kr)})")


if __name__ == "__main__":
    main()
