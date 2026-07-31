"""지수 고점권에서의 외국인 순매도(최근 5거래일 누적, 억원)를 froth 지표로 저장.

**왜 이 모양인가.** 이 자리엔 원래 '개인 순매수 강도'(네이버 금융 스크래핑)가 있었다.
froth 논리는 "개미가 고점을 떠받친다"였는데, 네이버 금융은 robots.txt 가
`User-agent: * / Disallow: /` 라 우리가 긁으면 안 되는 곳이었다. 그런데 개인 순매수
일별을 합법적으로 주는 곳이 없다 — ECOS 802Y001(일별)엔 **외국인만** 있고 투자자별은
901Y055 월별뿐이며, KRX OPEN API 엔 투자자별 서비스 자체가 없고, KRX 정보데이터시스템은
약관 제10조 ②·제12조 ② 가 자동 수집과 재배포를 막는다. 남은 건 유료(KRX 마켓데이터)뿐.

그래서 **주체를 개인에서 외국인으로 뒤집되, 게이트를 붙였다.**

외국인 순매수를 그대로 쓰면 어느 방향으로 놓아도 과열도가 안 된다(2026-07-31 ECOS
20년 실측). 순매도를 froth 로 두면 코로나 폭락(5일 누적 p90 +4.25조)이 개인 광풍
(+4.18조)과 같은 높이로 찍히고, 순매수를 froth 로 두면 2022 하락장이 2021 고점보다
높아진다. 개인 순매수가 froth 로 작동한 건 "개미가 고점에서 받는다"는 비대칭 때문인데,
외국인엔 그 비대칭이 없다 — 폭락에도 팔고 고점에도 판다.

**지수가 52주 고점 대비 −5% 이내일 때의 순매도만 센다.** 이러면 원래의 개미 논리가
그대로 들어온다: 고점권인데 외국인이 판다 = 그 물량을 개인이 받고 있다. 국면 대조
(5일 누적, 억원):

    2008 금융위기 폭락  p90        0     2021-06~07 코스피 고점  p90 17,683
    2022 하락장        p90        0     2021-01 개인 광풍      p90 22,340
    2020 코로나 폭락    p90    3,828     2024 평범             p90    884

폭락장이 전부 0 으로 막히고 고점 국면만 남는다. 게이트를 −10% 로 넓히면 폭락이 새기
시작하고 −15% 부터는 폭락이 고점을 앞지른다 — 그래서 −5% 다.

**값이 0 인 날이 86%다(최근 5년).** 이건 정보 손실이 아니라 신호다 — 고점권이 아니거나,
고점권이어도 외국인이 사는 중이라는 뜻이다. 연속적인 계기가 아니라 조건이 켜졌을 때만
울리는 지표로 읽어야 한다.

소스는 ECOS 한 곳이다(802Y001 일별: 외국인 순매수 0030000 · KOSPI 0001000). 게이트에
쓰는 지수도 여기서 받아 스크립트가 자족한다 — kospi_high_gap 지표(야후)를 참조하면
두 지표가 서로의 실패에 엮인다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_foreign_sell_at_high.py             # 최근 구간만 갱신
    python scripts/fetch_foreign_sell_at_high.py --backfill  # 5년치 백필
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.ecos_client import EcosUnavailableError, statistic_search  # noqa: E402
from common.indicator import ensure_indicator  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

ECOS_STAT_CODE = "802Y001"  # 주식시장(일)
ECOS_CYCLE = "D"
ITEM_FOREIGN_NET_BUY = "0030000"  # 외국인 순매수(유가증권시장), 억원
ITEM_KOSPI = "0001000"  # KOSPI지수

WINDOW = 5  # 최근 5거래일 누적(옛 개인 순매수 지표와 같은 창)
HIGH_WINDOW = 250  # 52주 고점을 재는 거래일 수
HIGH_GAP_GATE = -5.0  # 고점 대비 이 % 이내여야 '고점권'
UPSERT_DAYS = 40  # 매 실행 다시 계산해 덮어쓰는 최근 구간(거래일 기준 넉넉히)
BACKFILL_YEARS = 5

INDICATOR_SLUG = "foreign_sell_at_high"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "고점권 외국인 매도",
    "category": "시장",
    "headline": "지수가 고점 부근일 때 외국인이 파는 정도",
    "description_beginner": (
        "지수가 고점 근처인데 외국인이 팔고 있다면, 그 물량을 개인이 받고 있다는 뜻입니다"
    ),
    "unit": "억원",
}


def _ecos_daily(item_code: str, start: str, end: str) -> dict[str, float]:
    """{YYYYMMDD: 값}. ECOS 는 한 번에 최대 1000행이라 연 단위로 끊어 받는다."""
    out: dict[str, float] = {}
    for year in range(int(start[:4]), int(end[:4]) + 1):
        lo = max(start, f"{year}0101")
        hi = min(end, f"{year}1231")
        if lo > hi:
            continue
        for row in statistic_search(ECOS_STAT_CODE, ECOS_CYCLE, lo, hi, item_code, count=1000):
            out[row["TIME"]] = float(row["DATA_VALUE"])
    return out


def build_rows(days_back: int) -> list[tuple[str, float, dict]]:
    """(YYYY-MM-DD, raw_value, details) 리스트. 최신 days_back 거래일치를 돌려준다."""
    # 52주 고점을 재려면 대상 구간보다 HIGH_WINDOW 거래일 앞을 더 받아야 한다.
    # 거래일 250일 ≈ 달력 365일이라 넉넉히 잡는다.
    today = date.today()
    start = today - timedelta(days=int((days_back + HIGH_WINDOW + WINDOW) * 1.6))
    s, e = start.strftime("%Y%m%d"), today.strftime("%Y%m%d")

    net = _ecos_daily(ITEM_FOREIGN_NET_BUY, s, e)
    kospi = _ecos_daily(ITEM_KOSPI, s, e)

    # 두 계열 모두 값이 있는 날만 쓴다. ECOS 는 항목마다 반영 시점이 조금씩 달라
    # 최근 하루가 한쪽에만 있는 일이 있는데, 그날은 고점 판정을 못 하므로 건너뛴다.
    dates = sorted(set(net) & set(kospi))
    if len(dates) < HIGH_WINDOW + WINDOW:
        print(f"[WARNING] 표본이 {len(dates)}일뿐이라 52주 고점을 못 잡습니다. 종료.")
        return []

    closes = [kospi[d] for d in dates]
    rows: list[tuple[str, float, dict]] = []
    first = max(HIGH_WINDOW - 1, WINDOW - 1)
    for i in range(first, len(dates)):
        d = dates[i]
        high52 = max(closes[i - HIGH_WINDOW + 1 : i + 1])
        gap = (closes[i] / high52 - 1) * 100  # 고점 대비 낙폭(음수)
        window = [net[x] for x in dates[i - WINDOW + 1 : i + 1]]  # 과거→현재
        cum5 = sum(window)
        # froth = 고점권에서의 순매도량. 순매수이거나 고점권이 아니면 0.
        raw = max(0.0, -cum5) if gap >= HIGH_GAP_GATE else 0.0
        rows.append(
            (
                f"{d[:4]}-{d[4:6]}-{d[6:8]}",
                round(raw, 0),
                {
                    # 화면 헤드라인은 게이트 **전** 원값이다 — 게이트가 꺼진 날 0 만
                    # 보여주면 카드가 86% 의 날에 아무 말도 못 한다.
                    "cum5": round(cum5, 0),
                    "high_gap": round(gap, 2),
                    "at_high": 1 if gap >= HIGH_GAP_GATE else 0,
                    "daily5": [round(v, 0) for v in window],
                    # 거래일은 주말·휴장을 건너뛰어 화면에서 역산할 수 없다. 숫자 맵이라
                    # YYYYMMDD 정수로 넣는다(옛 개인 순매수 카드와 같은 방식).
                    "dates5": [int(x) for x in dates[i - WINDOW + 1 : i + 1]],
                },
            )
        )
    return rows[-days_back:]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help=f"{BACKFILL_YEARS}년치를 채운다")
    args = ap.parse_args()

    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    days = BACKFILL_YEARS * 250 if args.backfill else UPSERT_DAYS
    try:
        rows = build_rows(days)
    except EcosUnavailableError as e:
        # 해외 러너에서 ECOS 로 나가는 경로가 통째로 막히는 일이 있다(fetch_consumer_sentiment
        # 주석 참고). 여기서 터뜨리면 네트워크 문제 하나가 워크플로 전체를 실패로 만든다.
        # 값이 하루 낡는 것은 check_freshness.py 가 따로 감시한다.
        print(f"[WARNING] {e}")
        print("[WARNING] ECOS 접속 문제로 판단해 오늘 갱신을 건너뜁니다.")
        return

    if not rows:
        return

    for d, raw, details in rows:
        client.table("indicator_values").upsert(
            {"indicator_id": indicator_id, "date": d, "raw_value": float(raw), "details": details},
            on_conflict="indicator_id,date",
        ).execute()

    last_d, last_raw, last_det = rows[-1]
    on = "고점권" if last_det["at_high"] else "고점권 아님"
    print(
        f"[Supabase] {len(rows)}일치 upsert. 최신 {last_d} "
        f"5일누적 {last_det['cum5']:+,.0f}억 · 고점 대비 {last_det['high_gap']:+.2f}% ({on}) "
        f"→ raw {last_raw:,.0f}억"
    )


if __name__ == "__main__":
    main()
