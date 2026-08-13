"""KRX Open API 가 전 영업일 자료를 **몇 시에 올리는지** 실측한다(일회성 계측).

## 왜 재나

아침 파이프라인의 크론 슬롯은 "KRX 공표 직후에 실행되게 한다"는 이유로 골라져 있다
(.github/workflows/daily-update.yml 의 cron 주석). 그런데 그 근거가 관측 두 점뿐이다 —
**07:40 엔 없고 10:44 엔 있다**(2026-07 실측). 그 사이 어디인지는 아무도 모른다.

게다가 그 주석이 기대던 큐 지연이 줄었다. 2026-08-13 실측으로 발화→실행 지연이
**61~68분**인데 주석은 100~140분을 가정한다. 즉 실행이 10:45 가 아니라 **10:00~10:02**
에 시작하고 있다. 공표 시각을 모르면 여유가 얼마 남았는지도 모른다.

## 어떻게 재나

파이프라인이 실제로 쓰는 **7개 서비스 전부**를 5분 간격으로 두드려, 각각이 '0행 → N행'
으로 바뀌는 순간을 잡는다. 서비스마다 공표 시각이 다를 수 있고, 파이프라인이 기다려야
하는 건 그중 **가장 늦은 것**이라 하나만 재면 틀린 답이 나온다.

⚠️ **깃헙 예약 큐가 밀어 주는 것과 무관하게** 재려고 폴링 루프로 만들었다. 크론을
다섯 개 걸어 08:00·08:30·… 에 재려 해도 큐 지연이 60분씩 붙어 원하는 시각에 안 뜬다.
한 번 켜 두고 안에서 도는 편이 눈금이 정확하다.

실행:
    python data-pipeline/scripts/probe_krx_publish_time.py

    --interval 300   폴링 간격(초, 기본 300)
    --deadline 1130  이 시각(KST HHMM)까지만 기다린다(기본 1130)

수동으로 낮에 돌리면 이미 다 올라와 있어 "첫 조회부터 있음"으로 끝난다 — 배관 점검용
으로 그렇게 써도 된다(공표 시각은 못 얻는다).
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests  # noqa: E402

from common.config import KRX_API_KEY  # noqa: E402

KST = timezone(timedelta(hours=9))

# 파이프라인이 실제로 쓰는 서비스 전부(2026-08-13 기준, grep 으로 뽑았다).
# 이름 옆은 이 자료로 만드는 지표다 — 무엇이 늦어지는지 바로 읽히도록 적어 둔다.
ENDPOINTS: list[tuple[str, str, str]] = [
    ("idx/kospi_dd_trd", "코스피 지수 시세", "거래대금 급증도 · 버핏지수"),
    ("sto/stk_bydd_trd", "유가증권 일별매매", "거래대금 쏠림 · 급등종목 강도"),
    ("sto/ksq_bydd_trd", "코스닥 일별매매", "종목 마스터"),
    ("idx/drvprod_dd_trd", "파생상품지수", "VKOSPI"),
    ("etp/etf_bydd_trd", "ETF 일별매매", "레버리지 ETF"),
    ("drv/opt_bydd_trd", "옵션 일별매매", "풋콜 비율"),
    ("drv/fut_bydd_trd", "선물 일별매매", "선물 미결제약정"),
]

BASE = "http://data-dbg.krx.co.kr/svc/apis/{}"
REQUEST_TIMEOUT_SEC = 20


def target_business_day(now_kst: datetime) -> date:
    """오늘 아침에 올라올 자료의 기준일 = 직전 영업일(주말만 건너뛴다).

    공휴일 달력은 안 본다 — 공휴일 다음 날 돌리면 영영 안 올라오고 마감 시각에 끝난다.
    그 경우는 로그에 '끝까지 안 올라옴'으로 남으니 사람이 보고 판단하면 된다.
    """
    d = now_kst.date() - timedelta(days=1)
    while d.weekday() >= 5:  # 토(5)·일(6)
        d -= timedelta(days=1)
    return d


def row_count(path: str, bas_dd: str) -> int | None:
    """행 수. 요청 자체가 실패하면 None(그 회차만 건너뛴다)."""
    try:
        r = requests.get(
            BASE.format(path),
            headers={"AUTH_KEY": KRX_API_KEY},
            params={"basDd": bas_dd},
            timeout=REQUEST_TIMEOUT_SEC,
        )
        if r.status_code != 200:
            return None
        return len(r.json().get("OutBlock_1") or [])
    except Exception:
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=int, default=300, help="폴링 간격(초)")
    ap.add_argument("--deadline", type=str, default="1130", help="마감 시각(KST HHMM)")
    args = ap.parse_args()

    now = datetime.now(KST)
    target = target_business_day(now)
    bas_dd = target.strftime("%Y%m%d")
    dl_h, dl_m = int(args.deadline[:2]), int(args.deadline[2:])
    deadline = now.replace(hour=dl_h, minute=dl_m, second=0, microsecond=0)
    if deadline < now:
        deadline += timedelta(days=1)

    print(f"[계측] 기준일 {target} · 시작 {now:%H:%M:%S} KST · 마감 {deadline:%H:%M} KST")
    print(f"[계측] 서비스 {len(ENDPOINTS)}개 · {args.interval}초 간격\n")

    found: dict[str, tuple[str, int]] = {}
    first_check = True
    while True:
        stamp = datetime.now(KST)
        pending = [e for e in ENDPOINTS if e[0] not in found]
        line = []
        for path, label, _uses in pending:
            n = row_count(path, bas_dd)
            if n is None:
                line.append(f"{label}=?")
                continue
            line.append(f"{label}={n}")
            if n > 0:
                found[path] = (stamp.strftime("%H:%M:%S"), n)
                mark = "첫 조회부터 있음" if first_check else "← 방금 올라옴"
                print(f"  {stamp:%H:%M:%S}  ✅ {label} {n}행  {mark}")
        if line:
            print(f"  {stamp:%H:%M:%S}  {' · '.join(line)}", flush=True)
        first_check = False

        if len(found) == len(ENDPOINTS):
            print("\n[계측] 7개 전부 확인됐습니다.")
            break
        if datetime.now(KST) >= deadline:
            print("\n[계측] 마감 시각에 도달했습니다 — 아래 '미확인'은 끝까지 안 올라온 것입니다.")
            break
        time.sleep(args.interval)

    print(f"\n{'서비스':<22}{'올라온 시각':<12}{'행':<8}쓰는 곳")
    print("-" * 78)
    rows = []
    for path, label, uses in ENDPOINTS:
        t, n = found.get(path, ("미확인", 0))
        print(f"{label:<22}{t:<12}{n:<8}{uses}")
        rows.append((label, t, n, uses))

    seen = [t for t, _ in found.values()]
    if seen:
        print(f"\n[결론] 가장 이른 공표 {min(seen)} · **가장 늦은 공표 {max(seen)}**")
        print("       파이프라인이 기다려야 하는 건 가장 늦은 쪽입니다.")

    # 러너에서만 요약 탭에 표를 남긴다. 로컬에서는 이 변수가 없다 —
    # 빈 문자열을 Path 로 감싸면 '.'(디렉터리)가 되므로 값을 먼저 본다.
    summary_path = __import__("os").environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        summary = Path(summary_path)
        with summary.open("a", encoding="utf-8") as f:
            f.write(f"## KRX 공표 시각 실측 (기준일 {target})\n\n")
            f.write("| 서비스 | 올라온 시각(KST) | 행 | 쓰는 곳 |\n|---|---|---|---|\n")
            for label, t, n, uses in rows:
                f.write(f"| {label} | {t} | {n} | {uses} |\n")
            if seen:
                f.write(f"\n**가장 늦은 공표: {max(seen)}**\n")


if __name__ == "__main__":
    main()
