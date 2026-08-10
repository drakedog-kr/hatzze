"""국가별 미국 주식 보유·순매수·평가변동을 seohak_country_flows 에 upsert.

원천은 미 재무부 TIC(Treasury International Capital)의 CSLT 데이터셋이고, FRED 를
경유해 받는다. TIC 은 거래상대방의 **법적 거주지** 기준이라 "한국 거주자가 든 미국
주식"이 그대로 나온다. 예탁결제원 종목별이 막혀 있어도 국가 단위는 미국 쪽에서
이미 집계돼 있었다(자세한 경위는 supabase/migration_030 주석).

## 왜 cslt.zip 을 직접 안 받고 FRED 를 쓰나

재무부가 배포하는 cslt.zip 은 8.8MB 이지만 풀면 **121MB JSON 한 덩어리**이고 그 안에
4,260개 시리즈가 들어 있다. 우리가 쓰는 건 국가 7곳 × 4계열 = 28개뿐인데 매 실행
121MB 를 파싱하는 건 낭비다(러너 메모리도 든다). 같은 시리즈가 FRED 에 올라와 있어
필요한 것만 골라 받는다. 시리즈 ID 는 CSLT 의 국가 코드를 접미사로 쓴다.

⚠️ 예전 CSV(slt1d_globl.csv)는 **2023-01 에서 끊긴다.** 그걸 원천으로 삼으면 3년치가
조용히 비고, 표는 채워지므로 고장으로 보이지 않는다. 쓰지 말 것.

## 갱신 주기

원천이 월 1회, 약 2개월 지연이다(2026-05 자료가 2026-07-08 배포). 파이프라인은 매일
돌지만 대부분의 날은 새 달이 없다. 그래서 **바뀐 달만 쓴다** — 매일 498개월을 다시
쓰면 의미 없는 쓰기가 하루 한 번씩 쌓인다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_seohak_flows.py --dry-run   # 조회만, DB 안 씀
    python scripts/fetch_seohak_flows.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.fred_client import FredUnavailableError, observations  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

TABLE = "seohak_country_flows"
UPSERT_CHUNK = 500  # PostgREST 한 번에 보내는 행 수(다른 스크립트와 동일)

# TIC 국가 코드. FRED 시리즈 ID 의 접미사로 그대로 쓰인다.
#
# 한국이 주인공이고 나머지는 비교용이다. 비교국을 고른 기준은 "서학개미를 설명하는 데
# 쓸모가 있는가"다 — 아시아 이웃(일본·대만·홍콩·중국)과, 규모가 비슷해서 눈금을 잡아
# 주는 곳(싱가포르·영국)만 둔다. 144개국이 전부 있지만 다 담으면 표만 커지고 화면에
# 쓰이지 않는다.
#
# ⚠️ 싱가포르가 한국보다 크게 나오는 건 인구 대비 투자가 많아서가 아니라 TIC 이
# **보관기관 소재지** 기준이라 제3국 경유분이 몰리기 때문이다(TIC 의 알려진 한계).
# 화면에서 1인당으로 환산해 나란히 세우면 거짓말이 된다.
COUNTRIES = {
    "43001": "대한민국",
    "42609": "일본",
    "41408": "중국",
    "46302": "대만",
    "42005": "홍콩",
    "46019": "싱가포르",
    "13005": "영국",
}

HOME = "43001"  # 한국. 실패했을 때 "이건 없으면 안 된다"를 가르는 기준

# 계열별 FRED 시리즈 접두사.
#   FORLTEQTYPOS    그 나라 거주자가 든 미국 주식(잔액)
#   FORLTEQTYNET    그 달 순매수 (음수면 순매도)
#   FORLTEQTYVALCHG 그 달 평가액 변동
#   USLTEQTYPOS     역방향 — 미국 거주자가 든 그 나라 주식(잔액)
#   USLTEQTYNET     역방향 순매수 — 미국인이 그 나라 주식을 그 달에 산 금액
SERIES_PREFIX = {
    "holdings_usd_mn": "FORLTEQTYPOS",
    "net_purchase_usd_mn": "FORLTEQTYNET",
    "valuation_change_usd_mn": "FORLTEQTYVALCHG",
    "us_holdings_usd_mn": "USLTEQTYPOS",
    "us_net_purchase_usd_mn": "USLTEQTYNET",
}


def fetch_country(code: str) -> dict[str, dict[str, int]]:
    """한 나라의 다섯 계열을 {월: {칸: 값}} 으로 합친다.

    계열마다 시작 연도가 다르다(역방향이 더 짧은 나라가 있다). 월 하나에 칸이 다 차
    있을 거라고 가정하지 않는다 — 없는 칸은 None 으로 남고, 화면은 그걸 '자료 없음'
    으로 그린다.
    """
    merged: dict[str, dict[str, int]] = {}
    for column, prefix in SERIES_PREFIX.items():
        for month, value in observations(f"{prefix}{code}"):
            merged.setdefault(month, {})[column] = int(round(value))
    return merged


def to_rows(code: str, merged: dict[str, dict[str, int]]) -> list[dict]:
    rows = []
    for month in sorted(merged):
        row = {"country_code": code, "month": month}
        for column in SERIES_PREFIX:
            row[column] = merged[month].get(column)
        rows.append(row)
    return rows


def existing_months(db, code: str) -> set[str]:
    """이미 저장된 달. 원천이 월 1회 갱신이라 매일 전량을 다시 쓸 이유가 없다.

    행이 1,000을 넘을 수 있는 조회라 페이지를 이어 받는다(common/supabase_client.py
    의 load_all 주석 참고 — 한 나라 498개월이면 아직 캡 아래지만, 나라가 늘면 넘는다).
    """
    months: set[str] = set()
    start = 0
    while True:
        page = (
            db.table(TABLE)
            .select("month")
            .eq("country_code", code)
            .order("month")
            .range(start, start + 999)
            .execute()
        )
        rows = page.data or []
        months.update(r["month"] for r in rows)
        if len(rows) < 1000:
            return months
        start += 1000


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    db = None if dry_run else get_client()

    total_new = 0
    for code, label in COUNTRIES.items():
        try:
            merged = fetch_country(code)
        except FredUnavailableError as exc:
            # 한국이 실패하면 이번 실행은 의미가 없다. 비교국 하나가 빠지는 건
            # 화면이 견딜 수 있으므로 넘어간다.
            if code == HOME:
                print(f"✗ {label}({code}) 조회 실패 — 이번 실행을 중단합니다: {exc}")
                sys.exit(1)
            print(f"  ! {label}({code}) 건너뜀: {exc}")
            continue

        rows = to_rows(code, merged)
        if not rows:
            print(f"  ! {label}({code}) 응답이 비었습니다")
            continue

        if dry_run:
            latest = rows[-1]
            print(
                f"  {label}({code}) {rows[0]['month'][:7]}~{latest['month'][:7]} "
                f"{len(rows):>3}개월 · 최신 보유 ${(latest['holdings_usd_mn'] or 0)/1000:,.1f}B "
                f"· 순매수 {latest['net_purchase_usd_mn']:+,} · 평가 {latest['valuation_change_usd_mn']:+,}"
            )
            continue

        known = existing_months(db, code)
        fresh = [r for r in rows if r["month"] not in known]
        # 마지막 달은 원천이 나중에 수정하는 일이 있어(속보치 → 확정치) 늘 다시 쓴다.
        if rows and rows[-1] not in fresh:
            fresh.append(rows[-1])

        for i in range(0, len(fresh), UPSERT_CHUNK):
            db.table(TABLE).upsert(
                fresh[i : i + UPSERT_CHUNK], on_conflict="country_code,month"
            ).execute()
        total_new += len(fresh)
        print(f"  {label}({code}) {len(fresh)}개월 저장 (전체 {len(rows)}개월)")

    print(f"{'[dry-run] ' if dry_run else ''}완료 · 저장 {total_new}행")


if __name__ == "__main__":
    main()
