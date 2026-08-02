"""코스피에서 장중 10% 넘게 오른 종목의 비율을 froth 지표로 저장.

원값 = (종가가 +10% 이상 오른 종목 수) ÷ 전체 종목 수 × 100  (단위 %)

**비율인 게 핵심이다.** 개수로 재면 상장 종목이 늘기만 해도 값이 오른다(2021년
2,300개대 → 2,700개대). 분모가 전체 종목 수라 그 증가가 상쇄되고, 고정 눈금을
써도 낡지 않는다. 앞서 쓰던 가중 합산(3×상한가 + 2×(+20~29%) + 1×(+10~20%))은
개수 기반이라 롤링 평균을 기준선으로 삼아야 했는데, 그 장치가 통째로 필요 없어졌다.

**종가 기준이다**(KRX 의 FLUC_RT). 장중 고가로 재던 때도 있었는데, 그러면 상한가를
찍었다가 −22.75% 로 마감한 종목까지 '급등'으로 세게 된다(2026-07-30 실측: 장중 터치
18 중 9가 풀렸다). 끝까지 버틴 것만 세는 쪽이 "돈이 몰렸다"에 가깝다.
대신 장중에 크게 올랐다 밀린 종목은 안 잡힌다 — 같은 날 장중 6.15% vs 종가 4.24%.

**상한가 판정은 위도 막는다**(29.0~30.5%). 30.5 를 넘는 건 가격제한폭이 없는
종목(정리매매·신규상장 첫날)이라 상한가가 아니다.

## 눈금과 한계

눈금은 **고정 상한**이다(indicator_thresholds 의 kind="fixed"). 비율이라 상장 종목 수가
늘어도 값이 딸려 오르지 않으니 롤링 기준선이 필요 없다. 2026-08-01 에 초고온 진입선을
1.875% → **2.0%** 로 올렸다(상한 2.5% → 2.0÷0.75). 실측 1,342거래일에서 저온 45.5% ·
상온 38.5% · 고온 10.5% · 초고온 5.5%(74일)로 갈린다. 숫자의 근거는
indicator_thresholds.py 쪽에 모아 두었다 — 여기에 옮겨 적으면 눈금을 고칠 때 한쪽만
낡는다(실제로 낡아 있었다).

⚠️ **이 지표는 과열보다 변동성에 가깝다.** 2021-01 개인 광풍 대비 2026 폭락 구간에서
더 크게 나온다(실측: 폭락 중앙 90.6 vs 강세 45.4). 급등 종목 수는 시장이 어느 쪽으로든
크게 흔들릴 때 함께 늘기 때문이다. 상승−하락 상쇄·고점권 게이트·유지율 등 10가지
형태를 1,366거래일로 시험했지만 광풍과 폭락을 가르는 조합은 찾지 못했다(전수 탐색에서
46,225개 중 21%가 '분리'에 성공했는데, 그 통과율 자체가 신호가 아니라는 증거다).
2.0% 선은 광풍(2021년 최대 3.36%)과 폭락을 둘 다 초고온으로 올린다. 5.0% 로 올려 보니
광풍이 과열도 50 에서 멈춰 폭락만 잡혔다 — 둘을 가르는 눈금은 없고, 광풍을 넣으면 폭락도
따라 들어온다.

실행:
    cd data-pipeline && source .venv/bin/activate
    python scripts/fetch_limit_up_breadth.py             # 최근 구간 갱신
    python scripts/fetch_limit_up_breadth.py --backfill  # 2021년부터 백필
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.indicator import ensure_indicator  # noqa: E402
from common.krx_client import krx_get  # noqa: E402
from common.supabase_client import get_client  # noqa: E402

# 코스피만 본다. 상한가는 코스닥에서 훨씬 많이 나와서(같은 날 기준 3배쯤) 둘을 합치면
# 지표가 사실상 코스닥 지표가 된다. 이 사이트의 과열도는 코스피 시장을 말하므로 시장을
# 맞춘다. 코스닥 쏠림은 kosdaq_kospi_ratio 가 따로 본다.
KRX_URLS = ("http://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd",)
# 급등 판정선(종가 등락률, %). 이 위가 전부 원값의 분자다.
SURGE_LO = 10.0
LIMIT_LO, LIMIT_HI = 29.0, 30.5  # 상한가 판정 구간(호가 절사로 29.x~30.0 에 찍힌다)
BACKFILL_DAYS = 2000  # 달력일. 2021년 초까지 닿는다
RECENT_DAYS = 10  # 평소 실행에서 다시 계산하는 최근 구간(KRX 지연을 덮는다)
NAMES_PER_BUCKET = 10  # 툴팁에 적을 종목 수(거래대금 상위). 나머지는 "외 N개"로 센다
REQUEST_DELAY_SEC = 0.05

INDICATOR_SLUG = "limit_up_breadth"
INDICATOR_META = {
    "slug": INDICATOR_SLUG,
    "name": "급등 종목 비율",
    "category": "시장",
    "headline": "10% 넘게 오른 종목이 얼마나 되나",
    # 카드에서 headline 은 한 줄, 이 설명은 두 줄에 들어가야 한다. 시장(코스피)은 안 적는다 —
    # 사이트 전체가 코스피 과열도라 카드마다 되풀이할 필요가 없다(다른 카드도 안 적는다).
    # "평소 1%" 는 **최근 1년 중앙값(1.04%)** 이다. 5년 반 전체 중앙은 0.74% 인데 그걸
    # 쓰면 안 되는 이유가 있다 — 2021~2025 는 0.53~0.76% 로 안정적이었지만 2026 은 1.37%,
    # 최근 3개월은 1.48% 로 두 배가 됐다. 전체 중앙을 적으면 오늘 값 1.17% 가 "평소의
    # 1.7배"처럼 읽히는데 실제로는 최근 기준 **낮은 편**이라, 문구가 사실과 반대 인상을 준다.
    # 카드를 보는 사람은 "요즘과 견줘 오늘이 어떤가"를 묻지 5년 평균을 묻지 않는다.
    # ⚠️ 눈금(초고온 진입 2.0%)은 5년 반 전체로 잡아 둔 것이라 이 문구와 기간이 다르다.
    #    지표가 변동성을 재는 성질이라 최근이 유난할 뿐이고, 국면이 가라앉으면 둘을 같은
    #    기간으로 다시 맞출 것. 최근 1년 중앙 1.04% 는 이 눈금에서 과열도 39(상온)다.
    "description_beginner": "크게 뛴 종목이 쏟아질수록 단기 매매가 몰립니다",
    "unit": "%",
}


def _to_f(v) -> float:
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def collect_day(d: date) -> dict | None:
    """하루치 (원값, details). 휴장이거나 KRX 에 아직 없으면 None."""
    rows: list[dict] = []
    for url in KRX_URLS:
        resp = krx_get(url, d.strftime("%Y%m%d"))
        if resp is None:
            continue
        if resp.status_code == 401:
            raise PermissionError(
                f"KRX {url} 가 401. data.krx.co.kr 에서 해당 일별매매정보 Open API "
                "이용신청·승인을 확인하세요."
            )
        if resp.status_code != 200:
            continue
        rows += resp.json().get("OutBlock_1", [])
        time.sleep(REQUEST_DELAY_SEC)
    if not rows:
        return None

    # (거래대금, 종목명, 종가 등락률) — 카드에 적을 대표 종목을 거래대금 순으로 고른다.
    buckets: dict[str, list[tuple[float, str, float]]] = {"limit": [], "up20": [], "up10": []}
    for x in rows:
        fr = _to_f(x.get("FLUC_RT"))
        item = (_to_f(x.get("ACC_TRDVAL")), (x.get("ISU_NM") or "").strip(), fr)
        if LIMIT_LO <= fr <= LIMIT_HI:
            buckets["limit"].append(item)
        elif 20.0 <= fr < LIMIT_LO:
            buckets["up20"].append(item)
        elif 10.0 <= fr < 20.0:
            buckets["up10"].append(item)

    counts = {k: len(v) for k, v in buckets.items()}
    # 분자는 세 칸의 합 = 장중 +10% 이상 오른 모든 종목. 칸을 나눠 세는 건 카드 툴팁이
    # 강도별로 보여 주기 위한 것이지, 원값에는 가중치가 없다.
    surged = counts["limit"] + counts["up20"] + counts["up10"]
    raw = round(surged / len(rows) * 100, 3) if rows else 0.0

    details: dict = {
        "limit_n": counts["limit"],
        "up20_n": counts["up20"],
        "up10_n": counts["up10"],
        "listed_n": len(rows),
    }
    # 카드가 "종목명 +23.4%" 로 적으려면 등락률이 있어야 한다. 이름만 저장하던 때는
    # 버킷 이름(+20% 등)밖에 못 붙여서 랭킹이 밋밋했다.
    # {"n": 종목명, "p": 장중 최고 등락률} 로 넣는다 — 옛 행은 문자열 배열이라 화면 쪽에
    # 두 모양을 다 받는 정규화가 있다(app/page.tsx 의 CardLimitUp).
    for key, items in buckets.items():
        items.sort(key=lambda t: -t[0])
        details[f"{key}_names"] = [
            {"n": nm, "p": round(hi, 1)} for _, nm, hi in items[:NAMES_PER_BUCKET] if nm
        ]
    return {"raw": float(raw), "details": details}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="2021년까지 채운다")
    args = ap.parse_args()

    client = get_client()
    indicator_id = ensure_indicator(client, INDICATOR_META)
    print(f"[Supabase] indicator '{INDICATOR_SLUG}' id: {indicator_id}")

    span = BACKFILL_DAYS if args.backfill else RECENT_DAYS
    today = date.today()
    saved = 0
    last: tuple[str, dict] | None = None
    for i in range(span):
        d = today - timedelta(days=i)
        if d.weekday() >= 5:  # 주말은 호출조차 하지 않는다
            continue
        got = collect_day(d)
        if not got:
            continue
        iso = d.isoformat()
        client.table("indicator_values").upsert(
            {
                "indicator_id": indicator_id,
                "date": iso,
                "raw_value": got["raw"],
                "details": got["details"],
            },
            on_conflict="indicator_id,date",
        ).execute()
        saved += 1
        if last is None:
            last = (iso, got)
        if args.backfill and saved % 100 == 0:
            print(f"[진행] {iso} 까지 {saved}거래일", flush=True)

    if last is None:
        print("[WARNING] 저장할 거래일이 없습니다(KRX 지연이거나 연휴).")
        return
    iso, got = last
    dt = got["details"]
    print(
        f"[Supabase] {saved}거래일 upsert. 최신 {iso} → {got['raw']:.2f}% "
        f"(상한가 {dt['limit_n']} · +20~29% {dt['up20_n']} · +10~20% {dt['up10_n']} / 전체 {dt['listed_n']})"
    )


if __name__ == "__main__":
    main()
